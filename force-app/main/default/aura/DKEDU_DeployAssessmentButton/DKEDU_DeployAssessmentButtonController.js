/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
// DeployAssessmentController.js
({
    deployAssessment: function(component, event, helper) {
        component.set("v.isDeploying", true);
        
        var action = component.get("c.createAssessmentSheet");
        action.setParams({
            assessmentMasterId: component.get("v.recordId")
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                var assessmentSheetId = response.getReturnValue();
                helper.showToast("성공", "시험지가 배포되었습니다.", "success");
                helper.navigateToAssessmentPage(component, assessmentSheetId);
            } else {
                helper.showToast("오류", "배포 중 문제가 발생했습니다.", "error");
            }
            component.set("v.isDeploying", false);
        });
        
        $A.enqueueAction(action);
    }
})