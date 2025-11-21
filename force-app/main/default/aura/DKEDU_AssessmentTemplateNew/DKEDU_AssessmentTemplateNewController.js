({
    init: function(component, event, helper) {
        console.log('[Aura] Assessment Template component initialized');
    },
    
    handleNavigation: function(component, event, helper) {
        console.log('[Aura] Navigation event received');
        
        var eventDetail = event.getParam('detail') || {};
        
        // Navigate to Assessment Template object home
        var homeEvt = $A.get("e.force:navigateToObjectHome");
        homeEvt.setParams({
            "scope": "AssessmentTemplate__c"
        });
        homeEvt.fire();
        
        // Close the quick action
        var dismissActionPanel = $A.get("e.force:closeQuickAction");
        dismissActionPanel.fire();
    }
});