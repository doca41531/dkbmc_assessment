/**
 * @description       : Assessment Page Controller - Simplified to pass data to LWC
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    doInit: function(component, event, helper) {
        // URL에서 sheetId 파라미터 읽기
        var urlParams = new URLSearchParams(window.location.search);
        var sheetId = urlParams.get('sheetId');
        
        if (sheetId) {
            component.set("v.sheetId", sheetId);
            console.log('Aura wrapper initialized with sheetId:', sheetId);
        } else {
            console.error('No sheetId parameter found in URL');
            // 에러 처리
            helper.showToast("오류", "시험 ID가 URL에 없습니다.", "error");
        }
    }
})