chrome.alarms.onAlarm.addListener(function(alarm) {	
	if (alarm['name'] != "selling_alarm") {
		return;
	}
	
	chrome.storage.sync.get(function(sync_storage) {
		chrome.storage.local.get(function(local_storage) {
			if (!sync_storage['current_api_key']) {
				console.log("API key is not defined in extension settings.");
				return;
			}
			
			if (typeof sync_storage['settings']['algorithm'] === "undefined" || sync_storage['settings']['algorithm'] == 0 || sync_storage['settings']['algorithm'] == 3) {
				// Базовый алгоритм с отслеживанием
				if (!local_storage['selling_track_list'] || Object.size(local_storage['selling_track_list']) == 0) {
					console.log("You are not tracking any items.");
					return;
				}
				
				deep_ajax_load({
					"url": 'https://api.guildwars2.com/v2/commerce/transactions/current/sells',
					"api_key": sync_storage['current_api_key'],
					"local_page": "bg-sells.js",
					"api_page": 0
				}, function(stat, data) {
					if (stat == "fail") {
						if (data[1] === "timeout") {
							console.log("Timeout error occured while trying to recieve selling list.");
						}
						else if (data[0]['responseJSON'] && data[0]['responseJSON']['text']) {
							console.log(data[0]['responseJSON']['text']);
						}
						else {
							console.log("Unknown error occured while trying to recieve selling list.");
						}
						
						return;
					}

					var item_ids = {};
					var sold_item_ids = {};
					
					data.forEach(function(item, i, arr) {
						item_ids[item['id']] = {"count": item['quantity']};
					});
					
					$.each(local_storage['selling_track_list'], function(index, value) {
						console.log("Check if item " + index + " exists in selling list.");
						
						if (!item_ids[index]) {
							delete local_storage['selling_track_list'][index];
							
							sold_item_ids[value['item_vnum']] = {
								"count": value['item_count'],
								"price": value['item_price'],
								"sold_all": true
							};
							
							console.log("Item " + index + " has been removed from selling track list.");

							// Hide item in popup window
							var popup_elements = chrome.extension.getViews({type: "popup"});
							
							for (var i = 0; i < popup_elements.length; i++) {
								if (popup_elements[i].document.getElementById('item-' + index)) {
									popup_elements[i].document.getElementById('item-' + index).style.display = "none";
								}
							}
						}
						
						else if (item_ids[index]['count'] < value['item_count']) {
							sold_item_ids[value['item_vnum']] = {
								"count": value['item_count'] - item_ids[index]['count'], /* database count (always bigger) - tp count = how much sold */
								"price": value['item_price'],
								"sold_all": false
							};
							
							// Set new itemcount in database
							local_storage['selling_track_list'][index]['item_count'] = item_ids[index]['count'];
						}
						
						else if (item_ids[index]['count'] > value['item_count']) {
							// Inc itemcount in database
							local_storage['selling_track_list'][index]['item_count'] = item_ids[index]['count'];
						}
					});
					
					chrome.storage.local.set({"selling_track_list": local_storage['selling_track_list']});
					
					if (Object.size(sold_item_ids) > 0) {
						var myAudio = new Audio("/mp3/sell.mp3");
						myAudio.volume = typeof sync_storage['settings']['sound'] === "undefined" ? 0.1 : sync_storage['settings']['sound'];
						myAudio.play();
						
						send_success_sell_notification(sold_item_ids);
					}
				});
			}
			else {
				// Алгоритм, оповещающий о всех совершенных транзакциях
				deep_ajax_load({
					"url": 'https://api.guildwars2.com/v2/commerce/transactions/history/sells',
					"api_key": sync_storage['current_api_key'],
					"local_page": "bg-sells.js",
					"api_page": 0
				}, function(stat, data) {
					if (stat == "fail") {
						if (data[1] === "timeout") {
							console.log("Timeout error occured while trying to recieve selling history.");
						}
						else if (data[0]['responseJSON'] && data[0]['responseJSON']['text']) {
							console.log(data[0]['responseJSON']['text']);
						}
						else {
							console.log("Unknown error occured while trying to recieve selling history.");
						}
						
						return;
					}
					
					var item_ids = {};
					var sold_item_ids = {};
					
					data.forEach(function(item, i, arr) {
						item_ids[item['id']] = {"count": item['quantity'], "vnum": item['item_id'], "price": item['price']};
					});
					
					chrome.storage.local.set({"historical_sold": Object.keys(item_ids)});
					
					if (local_storage["historical_sold"] && local_storage["historical_sold"].length > 0) {
						var difference = Object.keys(item_ids).filter(function(el) {
							return local_storage["historical_sold"].indexOf(el) < 0;
						});
						
						if (difference.length == 0) {
							console.log("There are no sold items.");
							return;
						}
						
						difference.forEach(function(item, i, arr) {
							if (sold_item_ids[item_ids[item]['vnum']]) {
								sold_item_ids[item_ids[item]['vnum']]['count'] = sold_item_ids[item_ids[item]['vnum']]['count'] + item_ids[item]['count'];
								sold_item_ids[item_ids[item]['vnum']]['price'] = sold_item_ids[item_ids[item]['vnum']]['price'] + item_ids[item]['price'];
							}
							else {
								sold_item_ids[item_ids[item]['vnum']] = {
									"count": item_ids[item]['count'],
									"price": item_ids[item]['price'],
									"sold_all": false
								};
							}
						});
				
						var myAudio = new Audio("/mp3/sell.mp3");
						myAudio.volume = typeof sync_storage['settings']['sound'] === "undefined" ? 0.1 : sync_storage['settings']['sound'];
						myAudio.play();
						
						var language = sync_storage && sync_storage['settings'] && sync_storage['settings']['item_localization'] ? sync_storage['settings']['item_localization'] : "en";
						
						send_success_sell_notification(sold_item_ids, language);
					}
					else {
						console.log("Just created new historical object in storage.");
					}
				});
			}
		});
	});
});


function send_success_sell_notification(sold_item_ids, language) {
	$.ajax({
		type: 'GET',
		url: 'https://api.guildwars2.com/v2/items',
		data: {"ids": Object.keys(sold_item_ids).join(","), "lang": language},
		dataType: "json",
		cache: true,
		timeout: 10000,
		success: function(data, textStatus, XMLHttpRequest) {
			$.each(sold_item_ids, function(index, value) {
				var data_index = findIndexByKeyValue(data, "id", index);
				
				var item_name = data[data_index]['name'];
				var item_icon = data[data_index]['icon'];
				
				chrome.notifications.create("notif_" + Date.now() + 'x' + Math.random(), {
					type: "basic",
					iconUrl: item_icon,
					title: chrome.i18n.getMessage("item_sold"),					
					message: item_name + ' (' + (value['sold_all'] ? chrome.i18n.getMessage("all") : value['count'] + " " + chrome.i18n.getMessage("items")) + ')',
					contextMessage: chrome.i18n.getMessage("profit", [format_coins_clean(Math.ceil(value['price'] / 100 * 85) * value['count'])])
				});
			});
		},
		error: function(x, t, m) {
			if (t === "timeout") {
				console.log("Timeout error occured while trying to recieve item metadata.");
			}
			else if (x['responseJSON'] && x['responseJSON']['text']) {
				console.log(x['responseJSON']['text']);
			}
			else {
				console.log("Unknown error occured while trying to load item metadata.");
			}
			
			$.each(sold_item_ids, function(index, value) {
				chrome.notifications.create("notif_" + Date.now() + 'x' + Math.random(), {
					type: "basic",
					iconUrl: "/img/logo-359.png",
					title: chrome.i18n.getMessage("item_sold"),
					message: index + ' (' + (value['sold_all'] ? chrome.i18n.getMessage("all") : value['count'] + " " + chrome.i18n.getMessage("items")) + ')',
					contextMessage: chrome.i18n.getMessage("profit", [format_coins_clean(Math.ceil(value['price'] / 100 * 85) * value['count'])])
				});
			});
		}
	});
}