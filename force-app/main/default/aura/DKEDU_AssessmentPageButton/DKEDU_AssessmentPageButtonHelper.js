/**
 * @description       : Assessment Page Button Helper
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-21
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    startAssessmentDirectly: function(component, recordId) {
        if (!recordId) {
            this.showToast("오류", "레코드 ID를 찾을 수 없습니다.", "error");
            this.closeAction(component);
            return;
        }
        
        console.log('Starting assessment directly for recordId:', recordId);
        
        try {
            // 전체 Experience Cloud URL 구성
            var baseUrl = 'https://roasted-node-8681-dev-ed.scratch.my.site.com';
            var siteUrl = baseUrl + '/AssessmentSheet/s/?sheetId=' + recordId;
            console.log('Opening URL:', siteUrl);
            
            // 짧은 지연 후 이동 (로딩 효과)
            setTimeout(function() {
                window.location.href = siteUrl;
            }, 500);
            
        } catch (e) {
            console.error('JavaScript error:', e);
            this.showToast("오류", "이동 중 오류: " + e.message, "error");
            this.closeAction(component);
        }
    },
    
    showToast: function(title, message, type) {
        var toastEvent = $A.get("e.force:showToast");
        toastEvent.setParams({
            title: title,
            message: message,
            type: type,
            duration: 3000
        });
        toastEvent.fire();
    },
    
    closeAction: function(component) {
        var dismissActionPanel = $A.get("e.force:closeQuickAction");
        dismissActionPanel.fire();
    }
})