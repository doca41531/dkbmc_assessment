/**
 * @description       : Assessment Page Helper - Simplified helper for Aura wrapper
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    showToast: function(title, message, type) {
        var toastEvent = $A.get("e.force:showToast");
        toastEvent.setParams({
            title: title,
            message: message,
            type: type,
            duration: 3000
        });
        toastEvent.fire();
    }
})