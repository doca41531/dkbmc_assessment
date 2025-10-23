/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
// DKEDU_AssessmentPageController.js
({
    doInit: function(component, event, helper) {
        var urlParams = new URLSearchParams(window.location.search);
        var sheetId = urlParams.get('sheetId');
        
        if (sheetId) {
            component.set("v.sheetId", sheetId);
            helper.loadAssessmentData(component, sheetId);
        }
        
        component.set("v.responses", {});
    },
    
    handleResponse: function(component, event, helper) {
        var responses = component.get("v.responses");
        var fieldName = event.getSource().get("v.name");
        var fieldValue = event.getSource().get("v.value");
        
        responses[fieldName] = fieldValue;
        component.set("v.responses", responses);
        
        helper.saveResponse(component, fieldName, fieldValue);
    },
    
    nextSection: function(component, event, helper) {
        var currentIndex = component.get("v.currentSectionIndex");
        var assessmentData = component.get("v.assessmentData");
        
        if (currentIndex < assessmentData.sections.length - 1) {
            var newIndex = currentIndex + 1;
            component.set("v.currentSectionIndex", newIndex);
            component.set("v.currentSection", assessmentData.sections[newIndex]);
            helper.loadSectionResponses(component, newIndex);
        }
    },
    
    previousSection: function(component, event, helper) {
        var currentIndex = component.get("v.currentSectionIndex");
        
        if (currentIndex > 0) {
            var newIndex = currentIndex - 1;
            var assessmentData = component.get("v.assessmentData");
            component.set("v.currentSectionIndex", newIndex);
            component.set("v.currentSection", assessmentData.sections[newIndex]);
            helper.loadSectionResponses(component, newIndex);
        }
    },
    
    submitAssessment: function(component, event, helper) {
        helper.submitAssessment(component);
    }
})