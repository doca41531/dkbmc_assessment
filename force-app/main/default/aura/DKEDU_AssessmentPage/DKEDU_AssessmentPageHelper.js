/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
// AssessmentPageHelper.js
({
// DKEDU_AssessmentPageController.js - Helper의 loadAssessmentData 콜백에서
loadAssessmentData: function(component, sheetId) {
    var action = component.get("c.getAssessmentData");
    action.setParams({ sheetId: sheetId });
    
    action.setCallback(this, function(response) {
        var state = response.getState();
        if (state === "SUCCESS") {
            var data = response.getReturnValue();
            component.set("v.assessmentData", data);
            
            // 첫 번째 섹션을 현재 섹션으로 설정
            if (data.sections && data.sections.length > 0) {
                component.set("v.currentSection", data.sections[0]);
            }
        }
    });
    
    $A.enqueueAction(action);
},
    
    saveResponse: function(component, itemId, answer) {
        var action = component.get("c.saveResponse");
        action.setParams({ 
            itemId: itemId,
            answer: answer 
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state !== "SUCCESS") {
                console.log("자동 저장 실패");
            }
        });
        
        $A.enqueueAction(action);
    },
    
    submitAssessment: function(component) {
        var sheetId = component.get("v.sheetId");
        var action = component.get("c.submitAssessment");
        action.setParams({ sheetId: sheetId });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                this.showToast("성공", "시험이 제출되었습니다", "success");
                // 결과 페이지로 이동
                window.location.href = '/assessment-result?sheetId=' + sheetId;
            } else {
                this.showToast("오류", "제출 실패", "error");
            }
        });
        
        $A.enqueueAction(action);
    },
    
    showToast: function(title, message, type) {
        var toastEvent = $A.get("e.force:showToast");
        toastEvent.setParams({
            title: title,
            message: message,
            type: type
        });
        toastEvent.fire();
    }
})