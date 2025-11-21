/**
 * @description       : Assessment Page Component - FIXED Internal Navigation Only
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-20
 * @last modified by  : mingyu.park@dkbmc.com
**/
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAssessmentData from '@salesforce/apex/DKEDU_AssessmentPageController.getAssessmentData';
import saveResponse from '@salesforce/apex/DKEDU_AssessmentPageController.saveResponse';
import submitAssessment from '@salesforce/apex/DKEDU_AssessmentPageController.submitAssessment';
import saveScore from '@salesforce/apex/DKEDU_AssessmentPageController.saveScore';

export default class DkeduAssessmentPageComponent extends NavigationMixin(LightningElement) {
    @api recordId; // Aura에서 전달받은 sheetId
    
    @track assessmentData;
    @track currentSectionIndex = 0;
    @track currentSection;
    @track responses = {};
    @track scores = {}; // ⭐ 채점용 점수 저장
    @track isLoading = false;
    @track isSubmitting = false;
    @track isGradingMode = false; // ⭐ 채점 모드 플래그

    connectedCallback() {
        console.log('=== LWC CONNECTED CALLBACK START ===');
        console.log('Initial recordId from @api:', this.recordId);
        
        // ⭐ URL에서 sheetId 파라미터 직접 읽기 (Aura wrapper 없이)
        const urlExtractionSuccess = this.extractSheetIdFromUrl();
        
        console.log('After URL extraction - recordId:', this.recordId);
        console.log('URL extraction success:', urlExtractionSuccess);
        console.log('Current URL:', window.location.href);
        console.log('Current domain:', window.location.hostname);
        
        if (this.recordId) {
            console.log('✅ Starting loadAssessmentData with recordId:', this.recordId);
            this.loadAssessmentData();
        } else {
            console.error('❌ No recordId available after URL extraction');
            this.showToast('오류', 'Sheet ID를 찾을 수 없습니다. URL 형식을 확인해주세요: ?sheetId=XXXX', 'error');
        }
    }

    // ⭐ URL에서 sheetId와 mode 추출하는 메서드 (강화된 버전)
    extractSheetIdFromUrl() {
        try {
            console.log('=== URL PARSING DEBUG START ===');
            console.log('Full URL:', window.location.href);
            console.log('Hostname:', window.location.hostname);
            console.log('Pathname:', window.location.pathname);
            console.log('Search:', window.location.search);
            console.log('Hash:', window.location.hash);
            
            let sheetId = null;
            let mode = null;
            
            // 방법 1: URL Search Parameters (?sheetId=xxx&mode=grading)
            if (window.location.search) {
                const urlParams = new URLSearchParams(window.location.search);
                sheetId = urlParams.get('sheetId');
                mode = urlParams.get('mode');
                console.log('Method 1 - URLSearchParams result:', {sheetId, mode});
            }
            
            // 방법 2: 수동 URL 파싱 (? 이후 모든 내용)
            if (!sheetId && window.location.search) {
                const searchStr = window.location.search.substring(1); // ? 제거
                const params = searchStr.split('&');
                for (let param of params) {
                    const [key, value] = param.split('=');
                    if (key === 'sheetId' && value) {
                        sheetId = decodeURIComponent(value);
                    } else if (key === 'mode' && value) {
                        mode = decodeURIComponent(value);
                    }
                }
                console.log('Method 2 - Manual parsing result:', {sheetId, mode});
            }
            
            // 방법 3: URL 전체에서 Salesforce ID 패턴 찾기
            if (!sheetId) {
                const idPattern = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/g;
                const matches = window.location.href.match(idPattern);
                if (matches) {
                    // Assessment Sheet ID는 보통 a07로 시작 (또는 해당 org의 prefix)
                    for (let match of matches) {
                        if (match.length === 15 || match.length === 18) {
                            sheetId = match;
                            console.log('Method 3 - Pattern matching result:', sheetId);
                            break;
                        }
                    }
                }
            }
            
            // 방법 4: Hash에서 찾기
            if (!sheetId && window.location.hash) {
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                sheetId = hashParams.get('sheetId');
                mode = hashParams.get('mode');
                console.log('Method 4 - Hash parsing result:', {sheetId, mode});
            }
            
            console.log('=== FINAL RESULT ===');
            console.log('Extracted sheetId:', sheetId);
            console.log('Extracted mode:', mode);
            
            if (sheetId && (sheetId.length === 15 || sheetId.length === 18)) {
                this.recordId = sheetId;
                
                // ⭐ 채점 모드 설정
                if (mode === 'grading') {
                    this.isGradingMode = true;
                    console.log('✅ Grading mode activated');
                }
                
                console.log('✅ Sheet ID successfully set:', this.recordId);
                return true;
            } else {
                console.error('❌ No valid sheetId found in URL');
                console.error('Expected: 15 or 18 character Salesforce ID');
                console.error('Found:', sheetId);
                return false;
            }
            
        } catch (error) {
            console.error('URL parsing error:', error);
            return false;
        }
    }

    loadAssessmentData() {
        this.isLoading = true;
        
        getAssessmentData({ sheetId: this.recordId })
            .then(result => {
                console.log('Assessment data loaded:', result);
                this.assessmentData = result;
                
                // ⭐ Complete 상태 체크
                if (result.status === 'Complete') {
                    this.showToast('알림', '이미 완료된 시험입니다. 읽기 전용 모드로 표시됩니다.', 'info');
                }
                
                if (result.sections && result.sections.length > 0) {
                    this.currentSection = result.sections[0];
                    
                    // ⭐ 채점 모드일 때 점수를 DOM에 직접 설정 (한번만)
                    if (this.isGradingMode) {
                        setTimeout(() => {
                            this.setScoreValues();
                        }, 500);
                    }
                    
                    this.loadSectionResponses();
                }
            })
            .catch(error => {
                console.error('Error loading assessment data:', error);
                this.showToast('오류', '시험 데이터 로드 실패: ' + this.getErrorMessage(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    loadSectionResponses() {
        if (this.currentSection && this.currentSection.items) {
            setTimeout(() => {
                this.currentSection.items.forEach((item) => {
                    let answerValue = this.responses[item.Id];
                    
                    if (this.isGradingMode && item.Answer__c) {
                        answerValue = item.Answer__c;
                        this.responses[item.Id] = item.Answer__c;
                    }
                    
                    if (answerValue) {
                        // Multi Choosable 체크박스 처리
                        if (item.questionType === 'Multi Choosable') {
                            const values = answerValue.split(';');
                            const checkboxes = this.template.querySelectorAll(`input[data-id="${item.Id}"][type="checkbox"]`);
                            checkboxes.forEach(checkbox => {
                                checkbox.checked = values.includes(checkbox.value);
                            });
                        }
                        // 기타 입력 타입들 (lightning-radio-group, lightning-input 등)
                        else {
                            const inputElement = this.template.querySelector(`[data-id="${item.Id}"]`);
                            if (inputElement && inputElement.value !== undefined) {
                                inputElement.value = answerValue;
                            }
                        }
                    }
                });
            }, 300);
        }
    }

    // ⭐ 채점 모드에서 기존 답변과 점수를 로드
    // ⭐ 점수를 DOM에 직접 설정 (리액티브 문제 해결)
    setScoreValues() {
        if (!this.currentSection || !this.currentSection.items) return;
        
        this.currentSection.items.forEach(item => {
            // 점수 입력 필드 찾기
            const scoreInput = this.template.querySelector(`lightning-input[data-field-type="score"][data-id="${item.Id}"]`);
            
            if (scoreInput && item.Score__c !== null && item.Score__c !== undefined) {
                // 0점을 포함한 모든 점수 설정
                scoreInput.value = item.Score__c;
                console.log(`✅ Set score ${item.Score__c} for ${item.Id}`);
            }
        });
    }

    loadExistingAnswersAndScores() {
        if (!this.assessmentData || !this.assessmentData.sections) return;

        // scores 객체 초기화 보장
        this.scores = this.scores || {};

        this.assessmentData.sections.forEach(section => {
            if (section.items) {
                section.items.forEach(item => {
                    // 기존 답변 로드
                    if (item.Answer__c) {
                        this.responses[item.Id] = item.Answer__c;
                    }
                    
                    // ⭐ 기존 점수 로드 - 0보다 큰 값만 저장
                    if (item.Score__c !== null && item.Score__c !== undefined && item.Score__c > 0) {
                        this.scores[item.Id] = item.Score__c;
                    }
                });
            }
        });
    }

    handleResponse(event) {
        // 채점 모드에서는 답변 변경을 막음
        if (this.isGradingMode) {
            event.preventDefault();
            return;
        }

        const fieldName = event.target.dataset.id;
        let fieldValue;

        // Multi Choosable의 경우 체크박스 배열 처리
        if (event.target.type === 'checkbox') {
            const questionType = event.target.dataset.questionType;
            if (questionType === 'Multi Choosable') {
                // 기존 선택된 값들 가져오기
                const existingValues = this.responses[fieldName] ? this.responses[fieldName].split(';') : [];
                const optionValue = event.target.value;
                
                if (event.target.checked) {
                    // 체크된 경우 추가
                    if (!existingValues.includes(optionValue)) {
                        existingValues.push(optionValue);
                    }
                } else {
                    // 체크 해제된 경우 제거
                    const index = existingValues.indexOf(optionValue);
                    if (index > -1) {
                        existingValues.splice(index, 1);
                    }
                }
                
                fieldValue = existingValues.filter(v => v).join(';');
            } else {
                fieldValue = event.target.checked ? event.target.value : '';
            }
        } else {
            fieldValue = event.target.value;
        }
        
        this.responses[fieldName] = fieldValue;
        
        // 자동 저장 (채점 모드가 아닐 때만)
        if (!this.isGradingMode) {
            this.saveResponseToServer(fieldName, fieldValue);
        }
    }

    // ⭐ 점수 변경 처리 (채점 모드 전용)
    handleScoreChange(event) {
        const itemId = event.target.dataset.id;
        const score = event.target.value;
        
        console.log('Score changed for item:', itemId, 'Score:', score);
        
        // 점수 저장
        this.scores = this.scores || {};
        this.scores[itemId] = score;
        
        // 서버에 점수 저장
        this.saveScoreToServer(itemId, score);
    }

    // ⭐ 점수를 서버에 저장
    saveScoreToServer(itemId, score) {
        saveScore({ 
            itemId: itemId,
            score: score 
        })
        .then(() => {
            console.log('점수 저장 성공: ' + itemId + ' = ' + score);
            this.showToast('저장됨', `점수 ${score}점이 저장되었습니다.`, 'success');
        })
        .catch(error => {
            console.log('점수 저장 실패: ' + this.getErrorMessage(error));
            this.showToast('저장 오류', '점수 저장에 실패했습니다', 'warning');
        });
    }

    saveResponseToServer(itemId, answer) {
        // Picklist 값 검증
        const validatedAnswer = this.validateAnswer(answer);
        
        saveResponse({ 
            itemId: itemId,
            answer: validatedAnswer 
        })
        .then(() => {
            console.log('응답 저장 성공: ' + itemId);
        })
        .catch(error => {
            console.log('자동 저장 실패: ' + this.getErrorMessage(error));
            this.showToast('저장 오류', '응답 저장에 실패했습니다', 'warning');
        });
    }

    validateAnswer(answer) {
        if (!answer) return answer;
        
        // Star Rating 처리 (1-5를 올바른 picklist 값으로 변환)
        if (answer.toString().match(/^[1-5]$/)) {
            const ratingMap = {
                "1": "1 Star",
                "2": "2 Stars", 
                "3": "3 Stars",
                "4": "4 Stars",
                "5": "5 Stars"
            };
            return ratingMap[answer.toString()] || answer;
        }

        // 앞뒤 공백 제거
        if (typeof answer === 'string') {
            return answer.trim();
        }

        return answer;
    }

    handleSectionChange() {
        this.loadSectionResponses();
    }

    nextSection() {
        // ⭐ 유효성 검사: 현재 섹션의 필수 질문들이 답변되었는지 확인
        if (!this.validateCurrentSection()) {
            return; // 유효성 검사 실패시 다음 섹션으로 이동하지 않음
        }
        
        if (this.currentSectionIndex < this.assessmentData.sections.length - 1) {
            this.currentSectionIndex++;
            this.currentSection = this.assessmentData.sections[this.currentSectionIndex];
            this.handleSectionChange();
        }
    }

    // ⭐ 현재 섹션의 유효성 검사
    validateCurrentSection() {
        if (!this.currentSection || !this.currentSection.items) {
            return true; // 질문이 없으면 통과
        }

        const emptyFields = [];
        
        this.currentSection.items.forEach((item, index) => {
            const response = this.responses[item.Id];
            
            // 빈 값 체크 (null, undefined, 빈 문자열, 공백만 있는 문자열)
            if (!response || response.toString().trim() === '') {
                emptyFields.push(`문제 ${index + 1}`);
            }
        });

        if (emptyFields.length > 0) {
            this.showToast(
                '입력 필요', 
                `다음 문제에 답변해 주세요: ${emptyFields.join(', ')}`, 
                'warning'
            );
            return false;
        }

        return true;
    }

    // ⭐ 제출 전 전체 유효성 검사
    validateAllSections() {
        const incompleteItems = [];
        
        if (this.assessmentData && this.assessmentData.sections) {
            this.assessmentData.sections.forEach((section, sectionIndex) => {
                if (section.items) {
                    section.items.forEach((item, itemIndex) => {
                        const response = this.responses[item.Id];
                        if (!response || response.toString().trim() === '') {
                            incompleteItems.push(`섹션 ${sectionIndex + 1} - 문제 ${itemIndex + 1}`);
                        }
                    });
                }
            });
        }

        if (incompleteItems.length > 0) {
            this.showToast(
                '제출 불가', 
                `다음 문제들에 답변이 필요합니다: ${incompleteItems.slice(0, 5).join(', ')}${incompleteItems.length > 5 ? ' 외 ' + (incompleteItems.length - 5) + '개' : ''}`, 
                'error'
            );
            return false;
        }

        return true;
    }

    previousSection() {
        if (this.currentSectionIndex > 0) {
            this.currentSectionIndex--;
            this.currentSection = this.assessmentData.sections[this.currentSectionIndex];
            this.handleSectionChange();
        }
    }

    submitAssessmentHandler() {
        // ⭐ 제출 전 전체 유효성 검사
        if (!this.validateAllSections()) {
            return; // 유효성 검사 실패시 제출하지 않음
        }

        this.isSubmitting = true;
        
        submitAssessment({ sheetId: this.recordId })
            .then(() => {
                this.showToast('성공', '시험이 제출되었습니다', 'success');
                
                // ⭐ 완전히 안전한 Navigation - NavigationMixin만 사용
                setTimeout(() => {
                    this.navigateToRecordPageSafely();
                }, 1500);
            })
            .catch(error => {
                console.error('Submit error:', error);
                const errorMsg = this.getErrorMessage(error);
                this.showToast('오류', '제출 실패: ' + errorMsg, 'error');
            })
            .finally(() => {
                this.isSubmitting = false;
            });
    }

    // ⭐ Experience Site에서 표준 Salesforce org로 이동
    navigateToRecordPageSafely() {
        console.log('=== NAVIGATION TO STANDARD SALESFORCE ORG ===');
        console.log('Current URL:', window.location.href);
        
        try {
            // Experience Site domain에서 표준 Lightning domain으로 변환
            // drive-enterprise-9975-dev-ed.scratch.my.site.com 
            // → drive-enterprise-9975-dev-ed.scratch.lightning.force.com
            let standardDomain = window.location.hostname;
            
            if (standardDomain.includes('.scratch.my.site.com')) {
                // Scratch org의 Experience Site → Lightning
                standardDomain = standardDomain.replace('.scratch.my.site.com', '.scratch.lightning.force.com');
            } else if (standardDomain.includes('.my.site.com')) {
                // 일반 Experience Site → Lightning
                standardDomain = standardDomain.replace('.my.site.com', '.lightning.force.com');
            } else if (standardDomain.includes('.site.com')) {
                // 기타 Site → Lightning
                standardDomain = standardDomain.replace('.site.com', '.lightning.force.com');
            }
            
            const standardUrl = `https://${standardDomain}/lightning/o/AssessmentSheet__c/list?filterName=__Recent`;
            
            console.log('Standard Salesforce URL:', standardUrl);
            
            // 표준 Salesforce org로 직접 이동
            window.location.href = standardUrl;
            
        } catch (error) {
            console.error('Standard org navigation failed:', error);
            
            // Fallback: NavigationMixin 사용
            this[NavigationMixin.Navigate]({
                type: 'standard__objectPage',
                attributes: {
                    objectApiName: 'AssessmentSheet__c',
                    actionName: 'list'
                },
                state: {
                    filterName: '__Recent'
                }
            });
        }
    }

    // Aura Component에 Navigation 요청
    requestAuraNavigation() {
        console.log('Requesting Aura parent to handle list view navigation');
        
        const navigateEvent = new CustomEvent('navigate', {
            detail: {
                objectApiName: 'AssessmentSheet__c',
                actionName: 'list'
            }
        });
        
        this.dispatchEvent(navigateEvent);
    }

    getErrorMessage(error) {
        if (error && error.body) {
            if (error.body.message) return error.body.message;
            if (error.body.fieldErrors) return JSON.stringify(error.body.fieldErrors);
            if (error.body.pageErrors && error.body.pageErrors.length > 0) {
                return error.body.pageErrors[0].message;
            }
        }
        return error.message || '알 수 없는 오류';
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            duration: 3000
        });
        this.dispatchEvent(event);
    }

    // ⭐ 옵션 데이터 파싱 메서드
    parseOptions(item) {
        console.log('=== parseOptions 호출 ===');
        console.log('Question ID:', item.Id);
        console.log('Question Type:', item.questionType);
        console.log('Raw item.options:', item.options);
        console.log('Raw item.Options__c:', item.Options__c);

        // 이미 배열 형태로 처리되어 있는 경우
        if (Array.isArray(item.options) && item.options.length > 0) {
            console.log('✅ Array options found:', item.options);
            const parsedOptions = item.options.map((option, index) => {
                if (typeof option === 'string') {
                    return { 
                        label: option, 
                        value: option, 
                        uniqueId: `${item.Id}-opt-${index}` 
                    };
                } else if (option && option.label && option.value) {
                    return { 
                        ...option, 
                        uniqueId: `${item.Id}-opt-${index}` 
                    };
                }
                return { 
                    label: String(option), 
                    value: String(option), 
                    uniqueId: `${item.Id}-opt-${index}` 
                };
            });
            console.log('✅ Parsed array options:', parsedOptions);
            return parsedOptions;
        }

        // 문자열로 저장된 옵션들을 파싱 (예: "옵션1;옵션2;옵션3")
        if (item.options && typeof item.options === 'string') {
            console.log('✅ String options found:', item.options);
            const parsedOptions = item.options.split(';').map((option, index) => {
                const trimmed = option.trim();
                return { 
                    label: trimmed, 
                    value: trimmed, 
                    uniqueId: `${item.Id}-opt-${index}` 
                };
            }).filter(option => option.label !== ''); // 빈 옵션 제거
            console.log('✅ Parsed string options:', parsedOptions);
            return parsedOptions;
        }

        // Options__c 필드에서 옵션 데이터 가져오기
        if (item.Options__c && typeof item.Options__c === 'string') {
            console.log('✅ Options__c field found:', item.Options__c);
            const parsedOptions = item.Options__c.split(';').map((option, index) => {
                const trimmed = option.trim();
                return { 
                    label: trimmed, 
                    value: trimmed, 
                    uniqueId: `${item.Id}-opt-${index}` 
                };
            }).filter(option => option.label !== ''); // 빈 옵션 제거
            console.log('✅ Parsed Options__c:', parsedOptions);
            return parsedOptions;
        }

        // 기타 가능한 필드들 확인
        const possibleFields = ['Choice_Options__c', 'Answer_Options__c', 'picklist_values'];
        for (let field of possibleFields) {
            if (item[field] && typeof item[field] === 'string') {
                console.log(`✅ ${field} field found:`, item[field]);
                const parsedOptions = item[field].split(';').map((option, index) => {
                    const trimmed = option.trim();
                    return { 
                        label: trimmed, 
                        value: trimmed, 
                        uniqueId: `${item.Id}-opt-${index}` 
                    };
                }).filter(option => option.label !== '');
                console.log(`✅ Parsed ${field}:`, parsedOptions);
                return parsedOptions;
            }
        }

        // 기본값 - 빈 배열이면 샘플 옵션 제공
        console.warn('⚠️ No valid options found for question:', item.Id);
        console.warn('⚠️ Available item fields:', Object.keys(item));
        
        // 질문 타입에 따라 기본 옵션 제공
        if (item.questionType === 'Multi Choosable') {
            return [
                { 
                    label: '선택하세요 (여러 개 가능)', 
                    value: 'placeholder', 
                    uniqueId: `${item.Id}-opt-0` 
                }
            ];
        } else {
            return [
                { 
                    label: '예', 
                    value: '예', 
                    uniqueId: `${item.Id}-opt-0` 
                },
                { 
                    label: '아니오', 
                    value: '아니오', 
                    uniqueId: `${item.Id}-opt-1` 
                }
            ];
        }
    }

    // Getters
    get isPreviousDisabled() {
        return this.currentSectionIndex === 0;
    }

    get isNextDisabled() {
        return !this.assessmentData || 
               this.currentSectionIndex >= this.assessmentData.sections.length - 1;
    }

    // ⭐ Complete 상태 체크
    get isCompleted() {
        return this.assessmentData && this.assessmentData.status === 'Complete';
    }

    // ⭐ 읽기 전용 모드
    get isReadOnly() {
        return this.isCompleted;
    }

    // ⭐ 제출 버튼 비활성화 조건
    get isSubmitDisabled() {
        return this.isSubmitting || this.isCompleted;
    }

    // ⭐ 네비게이션 버튼 비활성화 조건  
    get isNavigationDisabled() {
        return this.isCompleted;
    }

    get hasAssessmentData() {
        return this.assessmentData && this.assessmentData.sections && this.assessmentData.sections.length > 0;
    }

    get currentQuestions() {
        if (!this.currentSection || !this.currentSection.items) return [];
        
        return this.currentSection.items.map((item, index) => {
            return {
                ...item,
                displayIndex: index + 1,
                isShortAnswer: item.questionType === 'Short Answer',
                isNumberPoint: item.questionType === 'Number Point', 
                isChoosable: item.questionType === 'Choosable',
                isMultiChoosable: item.questionType === 'Multi Choosable',
                isStarRating: item.questionType === 'Star Rating',
                
                // 서버 데이터 그대로만 사용 - 복잡한 계산 없음
                submittedAnswer: item.Answer__c || '',
                scoreValue: '',  // 항상 빈 값으로 시작
                inputValue: item.Answer__c || '',  // 서버 답변 그대로
                
                // 옵션 처리 - 서버에서 온 옵션 데이터를 파싱
                options: (item.questionType === 'Choosable' || item.questionType === 'Multi Choosable') 
                    ? this.parseOptions(item) : undefined,
                starOptions: (item.questionType === 'Star Rating') 
                    ? [
                        { label: '1점', value: '1', uniqueId: `${item.Id}-star-1` },
                        { label: '2점', value: '2', uniqueId: `${item.Id}-star-2` },
                        { label: '3점', value: '3', uniqueId: `${item.Id}-star-3` },
                        { label: '4점', value: '4', uniqueId: `${item.Id}-star-4` },
                        { label: '5점', value: '5', uniqueId: `${item.Id}-star-5` }
                    ] : undefined
            };
        });
    }

    get progressBarStyle() {
        if (!this.assessmentData || !this.assessmentData.sections) return 'width: 0%';
        
        const progress = ((this.currentSectionIndex + 1) / this.assessmentData.sections.length) * 100;
        return `width: ${progress}%`;
    }

    get progressValue() {
        if (!this.assessmentData || !this.assessmentData.sections) return 0;
        return Math.round(((this.currentSectionIndex + 1) / this.assessmentData.sections.length) * 100);
    }
}