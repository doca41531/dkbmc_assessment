/**
 * @description       : Wrapper component to handle Assessment Template LightningModal opening from Aura
 * @author            : mingyu.park@dkbmc.com
 * @last modified on  : 2025-11-05
**/
import { LightningElement, api } from 'lwc';
import DkeduAssessmentTemplateModal from 'c/dkedu_assessmentTemplateModal';

export default class DkeduAssessmentTemplateModalWrapper extends LightningElement {
    @api parentRecordId;
    
    connectedCallback() {
        console.log('[Template Wrapper] connected with parentRecordId:', this.parentRecordId);
        // 컴포넌트가 로드되자마자 모달 열기
        this.openModal();
    }
    
    async openModal() {
        try {
            console.log('[Template Wrapper] Opening Assessment Template Modal...');
            
            const result = await DkeduAssessmentTemplateModal.open({
                label: 'New Assessment Template',
                size: 'medium',
                parentRecordId: this.parentRecordId
            });
            
            console.log('[Template Wrapper] Modal closed with result:', result);
            
            // 모달 결과 처리
            if (result && result.success) {
                console.log('[Template Wrapper] Modal completed successfully');
                // 성공 시 리스트로 이동
                this.navigateToList();
            } else {
                console.log('[Template Wrapper] Modal cancelled or failed');
                // 취소 시 뒤로 가기
                this.navigateBack();
            }
        } catch (error) {
            console.error('[Template Wrapper] Error opening modal:', error);
            this.navigateBack();
        }
    }
    
    navigateToList() {
        console.log('[Template Wrapper] Navigating to list...');
        // 리스트 뷰로 이동하는 이벤트 발생
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'list',
                success: true
            }
        });
        this.dispatchEvent(navEvent);
    }
    
    navigateBack() {
        console.log('[Template Wrapper] Navigating back...');
        // 뒤로 가기 이벤트 발생
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'back',
                success: false
            }
        });
        this.dispatchEvent(navEvent);
    }
}