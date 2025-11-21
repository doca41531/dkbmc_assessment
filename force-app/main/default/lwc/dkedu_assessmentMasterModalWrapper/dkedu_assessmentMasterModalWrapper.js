/**
 * @description       : Wrapper component to launch Assessment Master Modal from Aura
 * @author            : mingyu.park@dkbmc.com
 * @group             : DKEDU Components
 * @last modified on  : 2025-11-11
 * @last modified by  : mingyu.park@dkbmc.com
 */
import { LightningElement, api, track } from 'lwc';
import DkeduAssessmentMasterModal from 'c/dkedu_assessmentMasterModal';

export default class DkeduAssessmentMasterModalWrapper extends LightningElement {
    @api parentRecordId;
    
    @track isLoading = true;
    
    connectedCallback() {
        this.openModal();
    }
    
    async openModal() {
        try {
            
            const result = await DkeduAssessmentMasterModal.open({
                size: 'medium',
                parentRecordId: this.parentRecordId,
                mode: 'new'
            });
                        
            // 모달 결과 처리
            if (result && result.success) {
                console.log('Modal completed successfully');
                // 성공 시 리스트로 이동
                this.navigateToList();
            } else {
                this.navigateBack();
            }
        } catch (error) {
            console.error('Error opening modal:', error);
            this.navigateBack();
        } finally {
            this.isLoading = false;
        }
    }
    
    navigateToList() {
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'list',
                success: true
            }
        });
        this.dispatchEvent(navEvent);
    }
    
    navigateBack() {
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'back',
                success: false
            }
        });
        this.dispatchEvent(navEvent);
    }
}