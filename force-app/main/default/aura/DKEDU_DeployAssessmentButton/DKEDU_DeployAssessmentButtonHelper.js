/**
 * @description       : Assessment Sheet 배포 버튼 헬퍼 - 페이지 이동 로직 제거
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-21
 * @last modified by  : mingyu.park@dkbmc.com
**/
({
    showToast: function(title, message, type) {
        var toastEvent = $A.get("e.force:showToast");
        toastEvent.setParams({
            title: title,
            message: message,
            type: type,
            duration: type === "success" ? 3000 : 5000  // 성공은 3초, 오류는 5초
        });
        toastEvent.fire();
    }
})