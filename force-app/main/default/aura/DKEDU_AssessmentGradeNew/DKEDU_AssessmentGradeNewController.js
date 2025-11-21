/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-17
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    init: function(component, event, helper) {
        console.log('[Aura] Assessment Grade component initialized');
    },
    
    handleNavigation: function(component, event, helper) {
        console.log('[Aura] Grade Navigation event received');
        
        var eventDetail = event.getParam('detail') || {};
        
        // Navigate to Assessment Grade object home
        var homeEvt = $A.get("e.force:navigateToObjectHome");
        homeEvt.setParams({
            "scope": "AssessmentGrade__c"
        });
        homeEvt.fire();
        
        // Close the quick action
        var dismissActionPanel = $A.get("e.force:closeQuickAction");
        dismissActionPanel.fire();
    }
})