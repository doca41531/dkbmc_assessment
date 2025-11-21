/**
 * @description       : Wrapper component to launch Assessment Question Modal from Aura
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-17
 * @last modified by  : mingyu.park@dkbmc.com
**/
import { LightningElement, api } from 'lwc';
import DkeduAssessmentQuestionModal from 'c/dkedu_assessmentQuestionModal';

export default class DkeduAssessmentQuestionModalWrapper extends LightningElement {
    @api parentRecordId;
    
    connectedCallback() {
        console.log('Modal Wrapper connected with parentRecordId:', this.parentRecordId);
        this.openModal();
    }
    
    async openModal() {
        try {
            console.log('Opening Assessment Question Modal...');
            
            const result = await DkeduAssessmentQuestionModal.open({
                size: 'small',
                parentRecordId: this.parentRecordId,
                mode: 'new'
            });
            
            console.log('Modal closed with result:', result);
            
            if (result && result.success) {
                console.log('Modal completed successfully');
                this.navigateToList();
            } else {
                console.log('Modal cancelled or failed');
                this.navigateBack();
            }
        } catch (error) {
            console.error('Error opening modal:', error);
            this.navigateBack();
        }
    }
    
    navigateToList() {
        console.log('Navigating to list...');
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'list',
                success: true
            }
        });
        this.dispatchEvent(navEvent);
    }
    
    navigateBack() {
        console.log('Navigating back...');
        const navEvent = new CustomEvent('navigate', {
            detail: { 
                type: 'back',
                success: false
            }
        });
        this.dispatchEvent(navEvent);
    }
}