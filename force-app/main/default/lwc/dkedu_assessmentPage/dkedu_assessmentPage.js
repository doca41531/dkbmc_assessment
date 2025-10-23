/**
 * @description       : 
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-10-23
 * @last modified by  : mingyu.park@dkbmc.com
**/
import { LightningElement, track, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAssessmentData from '@salesforce/apex/DKEDU_AssessmentPageController.getAssessmentData';
import saveResponse from '@salesforce/apex/DKEDU_AssessmentPageController.saveResponse';
import submitAssessment from '@salesforce/apex/DKEDU_AssessmentPageController.submitAssessment';
import startAssessment from '@salesforce/apex/DKEDU_AssessmentPageController.startAssessment';
import isAssessmentAccessible from '@salesforce/apex/DKEDU_AssessmentPageController.isAssessmentAccessible';

const a = '123';

export default class Dkedu_assessmentPage extends LightningElement {
    @track assessmentData;
    @track currentSectionIndex = 0;
    @track currentSection;
    @track responses = {};
    @track isLoading = true;
    @track errorMessage;
    
    sheetId;
    
    // URL 파라미터에서 sheetId 추출
    @wire(CurrentPageReference)
    getPageReferenceParameters(currentPageReference) {
        if (currentPageReference) {
            this.sheetId = currentPageReference.state?.sheetId || 
                          new URLSearchParams(window.location.search).get('sheetId');
            
            if (this.sheetId) {
                this.loadAssessmentData();
            } else {
                this.errorMessage = 'Assessment Sheet ID가 제공되지 않았습니다.';
                this.isLoading = false;
            }
        }
    }
    
    // Assessment 데이터 로드
    async loadAssessmentData() {
        try {
            this.isLoading = true;
            
            // 접근 가능 여부 먼저 확인
            const accessible = await isAssessmentAccessible({ sheetId: this.sheetId });
            if (!accessible) {
                this.errorMessage = '이미 완료된 평가이거나 접근할 수 없는 평가입니다.';
                this.isLoading = false;
                return;
            }
            
            // 평가 시작 처리
            await startAssessment({ sheetId: this.sheetId });
            
            const result = await getAssessmentData({ sheetId: this.sheetId });
            
            this.assessmentData = result;
            
            // 섹션 데이터 처리
            if (result.sections && result.sections.length > 0) {
                // 각 아이템에 타입 정보 추가
                result.sections.forEach(section => {
                    section.items.forEach(item => {
                        item.isTextType = item.questionType === 'LongText' || item.questionType === 'Essay';
                        item.response = ''; // 초기 응답값
                    });
                });
                
                this.currentSection = result.sections[0];
                this.currentSectionIndex = 1; // 사용자에게 보여줄 때는 1부터 시작
            }
            
            this.errorMessage = null;
        } catch (error) {
            this.errorMessage = '데이터 로드 중 오류가 발생했습니다: ' + error.body?.message || error.message;
            console.error('Assessment data load error:', error);
        } finally {
            this.isLoading = false;
        }
    }
    
    // 응답 처리
    handleResponse(event) {
        const itemId = event.target.name;
        const value = event.target.value;
        
        // 로컬 응답 저장
        this.responses[itemId] = value;
        
        // 현재 섹션의 아이템 응답 업데이트
        if (this.currentSection && this.currentSection.items) {
            const item = this.currentSection.items.find(item => item.Id === itemId);
            if (item) {
                item.response = value;
            }
        }
        
        // 자동 저장 (디바운스 적용)
        this.debounceAutoSave(itemId, value);
    }
    
    // 자동 저장 디바운스
    debounceAutoSave(itemId, value) {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.autoSaveResponse(itemId, value);
        }, 1000); // 1초 후 저장
    }
    
    // 자동 저장
    async autoSaveResponse(itemId, value) {
        try {
            await saveResponse({ itemId: itemId, answer: value });
        } catch (error) {
            console.error('Auto save error:', error);
        }
    }
    
    // 다음 섹션
    nextSection() {
        if (this.currentSectionIndex < this.assessmentData.sections.length) {
            this.currentSectionIndex++;
            this.currentSection = this.assessmentData.sections[this.currentSectionIndex - 1];
            this.loadSectionResponses();
        }
    }
    
    // 이전 섹션
    previousSection() {
        if (this.currentSectionIndex > 1) {
            this.currentSectionIndex--;
            this.currentSection = this.assessmentData.sections[this.currentSectionIndex - 1];
            this.loadSectionResponses();
        }
    }
    
    // 섹션 응답 로드
    loadSectionResponses() {
        if (this.currentSection && this.currentSection.items) {
            this.currentSection.items.forEach(item => {
                if (this.responses[item.Id]) {
                    item.response = this.responses[item.Id];
                }
            });
        }
    }
    
    // 평가 제출
    async submitAssessment() {
        try {
            // 모든 응답 저장
            const savePromises = Object.keys(this.responses).map(itemId => {
                return saveResponse({ itemId: itemId, answer: this.responses[itemId] });
            });
            
            await Promise.all(savePromises);
            
            // 평가 상태 업데이트
            await submitAssessment({ sheetId: this.sheetId });
            
            this.showToast('성공', '평가가 성공적으로 제출되었습니다.', 'success');
            
            // 결과 페이지로 이동 (선택사항)
            setTimeout(() => {
                window.location.href = `/AssessmentSheet/s/result?sheetId=${this.sheetId}`;
            }, 2000);
            
        } catch (error) {
            this.showToast('오류', '제출 중 오류가 발생했습니다: ' + (error.body?.message || error.message), 'error');
        }
    }
    
    // Toast 메시지 표시
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
        });
        this.dispatchEvent(evt);
    }
    
    // Computed Properties
    get totalSections() {
        return this.assessmentData?.sections?.length || 0;
    }
    
    get isFirstSection() {
        return this.currentSectionIndex <= 1;
    }
    
    get isLastSection() {
        return this.currentSectionIndex >= this.totalSections;
    }
}