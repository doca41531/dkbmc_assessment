/**
 * @description       : Assessment Page Button Controller
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-18
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    doInit: function(component, event, helper) {
        var recordId = component.get("v.recordId");
        console.log('Assessment Button initialized with recordId:', recordId);
        
        // 바로 평가 시작
        helper.startAssessmentDirectly(component, recordId);
    },
    
    closeAction: function(component, event, helper) {
        helper.closeAction(component);
    }
})