/**
 * @description       : Assessment Page Button Helper - Corrected Page Path
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    startAssessmentDirectly: function(component, recordId) {
        if (!recordId) {
            this.showToast("오류", "레코드 ID를 찾을 수 없습니다.", "error");
            this.closeAction(component);
            return;
        }
        
        console.log('Checking assessment status for recordId:', recordId);
        
        // ⭐ 먼저 Assessment Sheet 상태와 사용자 권한 확인
        var action = component.get("c.getAssessmentStatusAndUserPermissions");
        action.setParams({
            "sheetId": recordId
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            
            if (state === "SUCCESS") {
                var result = response.getReturnValue();
                console.log('Assessment status and permissions:', result);
                
                var status = result.status;
                var isAdmin = result.isAdmin;
                
                // ⭐ Complete 상태 + 관리자 = 채점 페이지로 이동
                if (status === 'Complete' && isAdmin) {
                    this.showGradingOptions(component, recordId);
                    return;
                }
                
                // ⭐ Complete 상태 + 일반 사용자 = 접근 차단
                if (status === 'Complete') {
                    this.showToast(
                        "접근 제한", 
                        "이미 완료된 시험입니다. 결과를 확인하시려면 레코드 페이지를 참조하세요.", 
                        "info"
                    );
                    this.closeAction(component);
                    return;
                }
                
                // Complete가 아닌 경우 평가 페이지로 이동
                this.navigateToAssessmentPage(component, recordId);
                
            } else if (state === "ERROR") {
                var errors = response.getError();
                var message = "상태 확인 중 오류가 발생했습니다.";
                if (errors && errors[0] && errors[0].message) {
                    message = errors[0].message;
                }
                console.error('Status check error:', message);
                this.showToast("오류", message, "error");
                this.closeAction(component);
            }
        });
        
        $A.enqueueAction(action);
    },
    
    // ⭐ 채점 옵션 표시 (관리자 전용)
    showGradingOptions: function(component, recordId) {
        // 채점 옵션을 선택할 수 있는 모달 또는 직접 채점 페이지로 이동
        if (confirm("완료된 시험입니다.\n\n채점 페이지로 이동하시겠습니까?")) {
            this.navigateToGradingPage(component, recordId);
        } else {
            this.closeAction(component);
        }
    },
    
    // ⭐ 채점 페이지로 이동
    navigateToGradingPage: function(component, recordId) {
        console.log('Navigating to grading page for:', recordId);
        
        try {
            // ⭐ 채점용 Experience Site URL (기존 URL에 grading 모드 추가)
            var gradingUrl = 'https://drive-enterprise-9975-dev-ed.scratch.my.site.com/AssessmentSheet/s?sheetId=' + recordId + '&mode=grading';
            
            console.log('Using grading URL:', gradingUrl);
            
            // 채점 페이지로 이동
            setTimeout(function() {
                window.location.href = gradingUrl;
            }, 500);
            
        } catch (e) {
            console.error('Grading navigation error:', e);
            this.showToast("오류", "채점 페이지 이동 중 오류: " + e.message, "error");
            this.closeAction(component);
        }
    },
    
    // ⭐ 실제 평가 페이지로 이동하는 메서드 분리
    navigateToAssessmentPage: function(component, recordId) {
        console.log('Starting assessment for recordId:', recordId);
        
        try {
            // 고정 URL 사용 (현재 환경에 맞춰서)
            var siteUrl = 'https://drive-enterprise-9975-dev-ed.scratch.my.site.com/AssessmentSheet/s?sheetId=' + recordId;
            
            console.log('Using fixed URL:', siteUrl);
            
            // 짧은 지연 후 이동 (로딩 효과)
            setTimeout(function() {
                window.location.href = siteUrl;
            }, 500);
            
        } catch (e) {
            console.error('URL navigation error:', e);
            this.showToast("오류", "이동 중 오류: " + e.message, "error");
            this.closeAction(component);
        }
    },
    
    // Fallback 메소드들 (필요시만 사용)
    tryAlternativeMethods: function(component, recordId) {
        console.log('Trying alternative access methods...');
        
        // Lightning Navigation Service 사용
        try {
            this.navigateWithLightning(component, recordId);
            return;
        } catch (e) {
            console.error('Lightning Navigation failed:', e);
        }
        
        // 상대 경로 시도
        try {
            var relativePath = '/AssessmentSheet/s?sheetId=' + recordId;
            console.log('Trying relative path:', relativePath);
            window.location.href = relativePath;
            return;
        } catch (e) {
            console.error('Relative path failed:', e);
        }
        
        // 모든 방법 실패시 에러 표시
        this.showToast("오류", "평가 페이지로 이동할 수 없습니다.", "error");
        this.closeAction(component);
    },
    
    // Lightning Navigation Service 사용
    navigateWithLightning: function(component, recordId) {
        var navService = component.find("navService");
        if (navService) {
            // Lightning Page로 직접 이동
            var pageReference = {
                type: 'standard__component',
                attributes: {
                    componentName: 'c__DKEDU_AssessmentPage'
                },
                state: {
                    c__sheetId: recordId  // Lightning Component State로 전달
                }
            };
            
            navService.navigate(pageReference);
            this.closeAction(component);
        } else {
            throw new Error('Navigation service not available');
        }
    },
    
    showToast: function(title, message, type) {
        var toastEvent = $A.get("e.force:showToast");
        toastEvent.setParams({
            title: title,
            message: message,
            type: type,
            duration: 5000  // 더 오래 표시
        });
        toastEvent.fire();
    },
    
    closeAction: function(component) {
        var dismissActionPanel = $A.get("e.force:closeQuickAction");
        dismissActionPanel.fire();
    }
})