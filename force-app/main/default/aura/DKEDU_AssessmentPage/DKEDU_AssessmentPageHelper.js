/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    loadAssessmentData: function(component, sheetId) {
        var action = component.get("c.getAssessmentData");
        action.setParams({ sheetId: sheetId });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                var data = response.getReturnValue();
                component.set("v.assessmentData", data);
                
                if (data.sections && data.sections.length > 0) {
                    component.set("v.currentSection", data.sections[0]);
                }
            } else {
                this.showToast("오류", "시험 데이터 로드 실패", "error");
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
                window.location.href = '/assessment-result?sheetId=' + sheetId;
            } else {
                this.showToast("오류", "제출 실패", "error");
            }
        });
        
        $A.enqueueAction(action);
    },
    
    loadSectionResponses: function(component, sectionIndex) {
        var assessmentData = component.get("v.assessmentData");
        var responses = component.get("v.responses");
        var currentSection = assessmentData.sections[sectionIndex];
        
        if (currentSection && currentSection.items) {
            currentSection.items.forEach(function(item) {
                var inputCmp = component.find(item.Id);
                if (inputCmp && responses[item.Id]) {
                    inputCmp.set("v.value", responses[item.Id]);
                }
            });
        }
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