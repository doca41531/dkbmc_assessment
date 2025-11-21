/**
 * @description       : Aura Helper for Assessment Template Lightning Modal
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-04
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    openLightningModal: function(component) {
        console.log('[Helper] Opening Assessment Template Lightning Modal');
        
        try {
            // Create LWC dynamically using $A.createComponent
            $A.createComponent(
                "c:dkedu_assessmentTemplate",
                {
                    parentRecordId: component.get("v.recordId")
                },
                function(newComponent, status, errorMessage) {
                    if (status === "SUCCESS") {
                        console.log('[Helper] LWC Component created successfully');
                        
                        // Since we can't use Lightning Modal from Aura directly,
                        // we'll use a different approach - navigate to a page with the modal
                        var pageRef = {
                            type: 'standard__component',
                            attributes: {
                                componentName: 'c__dkedu_assessmentTemplate'
                            },
                            state: {
                                c__parentRecordId: component.get("v.recordId")
                            }
                        };
                        
                        var navService = component.find("navService");
                        if (navService) {
                            navService.navigate(pageRef);
                        } else {
                            // Fallback to standard new record page
                            this.navigateToStandardNew(component);
                        }
                        
                    } else {
                        console.error('[Helper] Component creation failed:', errorMessage);
                        this.navigateToStandardNew(component);
                    }
                }
            );
        } catch (error) {
            console.error('[Helper] Error in openLightningModal:', error);
            this.navigateToStandardNew(component);
        }
    },
    
    navigateToStandardNew: function(component) {
        console.log('[Helper] Falling back to standard new record page');
        
        // Navigate to standard new record page
        var createRecordEvent = $A.get("e.force:createRecord");
        createRecordEvent.setParams({
            "entityApiName": "AssessmentTemplate__c"
        });
        createRecordEvent.fire();
        
        // Close the quick action
        var dismissActionPanel = $A.get("e.force:closeQuickAction");
        dismissActionPanel.fire();
    }
})