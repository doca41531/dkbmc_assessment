/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
// AssessmentPageController.js
({
    doInit: function(component, event, helper) {
        // URL에서 sheetId 파라미터 읽기
        var urlParams = new URLSearchParams(window.location.search);
        var sheetId = urlParams.get('sheetId');
        
        if (sheetId) {
            component.set("v.sheetId", sheetId);
            helper.loadAssessmentData(component, sheetId);
        }
        
        // 응답 저장용 Map 초기화
        component.set("v.responses", {});
    },
    
    handleResponse: function(component, event, helper) {
        var responses = component.get("v.responses");
        var fieldName = event.getSource().get("v.name");
        var fieldValue = event.getSource().get("v.value");
        
        responses[fieldName] = fieldValue;
        component.set("v.responses", responses);
        
        // 자동 저장
        helper.saveResponse(component, fieldName, fieldValue);
    },
    
    nextSection: function(component, event, helper) {
        var currentIndex = component.get("v.currentSectionIndex");
        var assessmentData = component.get("v.assessmentData");
        
        if (currentIndex < assessmentData.sections.length - 1) {
            component.set("v.currentSectionIndex", currentIndex + 1);
        }
    },
    
    previousSection: function(component, event, helper) {
        var currentIndex = component.get("v.currentSectionIndex");
        
        if (currentIndex > 0) {
            component.set("v.currentSectionIndex", currentIndex - 1);
        }
    },
    
    submitAssessment: function(component, event, helper) {
        helper.submitAssessment(component);
    }
})