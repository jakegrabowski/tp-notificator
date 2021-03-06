$("document").ready(function() {
	var template = Handlebars.compile($("#debug").html());
	$("main").html(template());
	
	// Storage info
	cbf.storage.sync.getBytesInUse(function(bytesInUse) {
		$('#storage_in_use_total span[data-info=bytes]').text(bytesInUse);
		$('#storage_in_use_total span[data-info=percents]').text((bytesInUse / (102400 / 100)).toFixed(2));
		$('#storage_in_use_total progress').val(bytesInUse / (102400 / 100));
	});
	
	chrome.storage.local.getBytesInUse(function(bytesInUse) {
		$('#storage_in_use_local_current_api_key span[data-info=bytes]').text(bytesInUse);
		$('#storage_in_use_local_current_api_key span[data-info=percents]').text((bytesInUse / (5242880 / 100)).toFixed(2));
		$('#storage_in_use_local_current_api_key progress').val(bytesInUse / (5242880 / 100));
	});
	
	cbf.storage.sync.get(function(sync_storage) {
		$('#storage_in_use_item_count span[data-info=bytes]').text(Object.size(sync_storage));
		$('#storage_in_use_item_count span[data-info=percents]').text((Object.size(sync_storage) / (512 / 100)).toFixed(2));
		$('#storage_in_use_item_count progress').val(Object.size(sync_storage) / (512 / 100));
		
		$('#readable_sync_storage').html(JSON.stringify(sync_storage, null, 3));
		
		// Date installation
		$("#installed").text(chrome.i18n.getMessage("installed") + " " + time_ago(sync_storage['install_date']) + " " + chrome.i18n.getMessage("ago"));
	});
	
	chrome.storage.local.get(function(local_storage) {
		$('#readable_local_storage').html(JSON.stringify(local_storage, null, 3));
		
		if (local_storage['error_log'].length > 0) {
			$('#js_errors').empty();
			
			local_storage['error_log'].forEach(function(item, i, arr) {
				$('#js_errors').prepend('<div class="row">' +
					'<div class="col-xs-3">' + time_ago(item['date']) + ' ' + chrome.i18n.getMessage("ago") + '<span class="full-opacity">: </span></div>' +
					'<div class="col-xs-9">Line <u>' + item['lineNo'] + '</u> in <code>' + item['url'] + ' @ ' + item['page'] + '</code><br>' + item['msg'] + '</div>' +
				'</div>');
			});
		}
	});
	
	// Version
	$("#app_version").text(chrome.runtime.getManifest().version + ' / ' + browser_info['name'] + ' (' + browser_info['version'] + ')');
	
	// Timers data
	chrome.alarms.getAll(function(timers) {
		$('#timers_data').html(JSON.stringify(timers, null, 3));
	});
	
	// Permissions
	chrome.storage.local.get(function(local_storage) {
		if (!local_storage['current_api_key']) {
			$("#permissions").text(chrome.i18n.getMessage("didnt_select_api_key"));
		}
		else {
			$("#permissions").text(chrome.i18n.getMessage("loading"));
			
			$.ajax({
				type: 'GET',
				url: 'https://api.guildwars2.com/v2/tokeninfo',
				dataType: "json",
				headers: {"Authorization": "Bearer " + local_storage['current_api_key']},
				timeout: 10000,
				tryCount: 0,
				retryLimit: 3,
				success: function(data, textStatus, XMLHttpRequest) {					
					$("#permissions").empty();
					
					data['permissions'].forEach(function(item, i, arr) {
						$("#permissions").append('<span class="tag tag-default">' + item + '</span> ');
					});
				},
				error: function(x, t, m) {					
					if (++this.tryCount <= this.retryLimit) {
						$.ajax(this);
						return;
					}
					
					if (t === "timeout") {
						$("#permissions").html('<span class="text-danger">' + chrome.i18n.getMessage("connection_timeout") + '</span>');
					}
					else if (x['responseJSON'] && x['responseJSON']['text']) {
						$("#permissions").html('<span class="text-danger text-fl-uppercase">' + x['responseJSON']['text'] + '.</span>');
					}
					else {
						$("#permissions").html('<span class="text-danger">' + chrome.i18n.getMessage("unknown_error") + '</span>');
					}
				}
			});
		}
	});
});

// Reset all timers
$(document).off("click", "#clear_timers").on("click", "#clear_timers", function() {
	chrome.alarms.clearAll(function() {
		chrome.runtime.reload();
	});
});
