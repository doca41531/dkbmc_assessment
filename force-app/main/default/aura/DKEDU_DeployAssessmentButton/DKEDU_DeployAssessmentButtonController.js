/**
 * @description       : Assessment Sheet 배포 버튼 컨트롤러 - 페이지 이동 로직 제거
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-21
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    deployAssessment: function(component, event, helper) {
        var action = component.get("c.createAssessmentSheet");
        action.setParams({
            assessmentMasterId: component.get("v.recordId")
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                var resultMessage = response.getReturnValue();
                
                // 성공 메시지 표시
                helper.showToast(
                    "배포 완료", 
                    resultMessage, 
                    "success"
                );
                
                // Quick Action 창 닫기
                $A.get("e.force:closeQuickAction").fire();
                
                // 페이지 새로고침하여 관련 목록 업데이트
                $A.get('e.force:refreshView').fire();
                
            } else {
                var errors = response.getError();
                var errorMessage = "배포 중 문제가 발생했습니다.";
                
                if (errors && errors[0] && errors[0].message) {
                    errorMessage = errors[0].message;
                }
                
                helper.showToast("오류", errorMessage, "error");
                $A.get("e.force:closeQuickAction").fire();
            }
        });
        
        $A.enqueueAction(action);
    }
})