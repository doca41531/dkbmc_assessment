/**
 * @description       : Assessment Page Component - FIXED Internal Navigation Only
 * @author            : mingyu.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-11-21
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
    @track maxScores = {}; // ⭐ 각 질문별 최대 점수 저장
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
        
        // ⭐ 점수 배열 명시적 초기화 (자동 할당 방지)
        this.scores = {};
        
        getAssessmentData({ sheetId: this.recordId })
            .then(result => {
                console.log('Assessment data loaded:', result);
                this.assessmentData = result;
                
                // ⭐ maxScores 맵 구성 (각 질문별 최대 점수)
                this.buildMaxScoresMap(result.sections);
                
                // ⭐ Complete 상태 체크
                if (result.status === 'Complete') {
                    this.showToast('알림', '이미 완료된 시험입니다. 읽기 전용 모드로 표시됩니다.', 'info');
                }
                
                if (result.sections && result.sections.length > 0) {
                    this.currentSection = result.sections[0];
                    
                    // ⭐ 채점 모드일 때만 점수를 DOM에 직접 설정 (한번만)
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
    
    // ⭐ 각 질문별 최대 점수 맵 구성
    buildMaxScoresMap(sections) {
        this.maxScores = {};
        if (sections) {
            sections.forEach(section => {
                if (section.items) {
                    section.items.forEach(item => {
                        // maxScore가 있으면 사용, 없으면 기본값 100
                        this.maxScores[item.Id] = item.maxScore || 100;
                    });
                }
            });
        }
        console.log('Max scores map built:', this.maxScores);
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
                        // 기타 입력 타입들 (lightning-radio-group, lightning-input 등) - 점수 입력 필드 제외
                        else {
                            // ⭐ 점수 입력 필드가 아닌 답변 입력 필드만 선택
                            const inputElement = this.template.querySelector(`[data-id="${item.Id}"]:not([data-field-type="score"])`);
                            if (inputElement && inputElement.value !== undefined) {
                                inputElement.value = answerValue;
                            }
                        }
                    }
                });
                
                // ⭐ 채점 모드일 때는 답변 로드 후 점수도 별도로 설정
                if (this.isGradingMode) {
                    this.setScoreValues();
                }
            }, 300);
        }
    }

    setScoreValues() {
        if (this.currentSection && this.currentSection.items) {
            this.currentSection.items.forEach((item) => {
                // ⭐ 실제 Score__c 필드값이 있을 때만 설정 (Answer__c와 혼동 방지)
                if (item.Score__c !== null && item.Score__c !== undefined && item.Score__c !== '') {
                    const scoreInput = this.template.querySelector(`lightning-input[data-id="${item.Id}"][data-field-type="score"]`);
                    if (scoreInput) {
                        scoreInput.value = item.Score__c;
                        this.scores[item.Id] = item.Score__c;
                        console.log(`Setting score for ${item.Id}: ${item.Score__c}`);
                    }
                } else {
                    // ⭐ 점수가 없으면 명시적으로 빈 값으로 설정
                    const scoreInput = this.template.querySelector(`lightning-input[data-id="${item.Id}"][data-field-type="score"]`);
                    if (scoreInput) {
                        scoreInput.value = '';
                        this.scores[item.Id] = '';
                        console.log(`Clearing score for ${item.Id}`);
                    }
                }
            });
        }
    }

    // ⭐ 점수 변경 핸들러 (실시간 검증 추가)
    handleScoreChange(event) {
        const itemId = event.target.dataset.id;
        const score = parseFloat(event.target.value);
        const maxScore = this.maxScores[itemId] || 100;
        
        console.log('Score change:', { itemId, score, maxScore });
        
        // ⭐ 실시간 검증
        if (score > maxScore) {
            this.showToast(
                '점수 초과 오류', 
                `입력된 점수(${score})가 최대 점수(${maxScore})를 초과할 수 없습니다.`, 
                'error'
            );
            // 값을 최대 점수로 제한
            event.target.value = maxScore;
            this.scores[itemId] = maxScore;
            return;
        }
        
        if (score < 0) {
            this.showToast('점수 오류', '점수는 0보다 작을 수 없습니다.', 'error');
            event.target.value = 0;
            this.scores[itemId] = 0;
            return;
        }
        
        // 정상적인 경우 점수 저장
        this.scores[itemId] = score;
        
        // ⭐ 자동 저장 (디바운싱 적용)
        clearTimeout(this.scoreDebounceTimer);
        this.scoreDebounceTimer = setTimeout(() => {
            this.saveScoreToServer(itemId, score);
        }, 1000); // 1초 후 자동 저장
    }
    
    // ⭐ 서버로 점수 저장
    saveScoreToServer(itemId, score) {
        saveScore({ itemId: itemId, score: score })
            .then(result => {
                console.log('Score saved successfully:', result);
                // 성공 시 조용히 저장 (토스트 메시지 없음)
            })
            .catch(error => {
                console.error('Error saving score:', error);
                this.showToast('점수 저장 오류', this.getErrorMessage(error), 'error');
                
                // 저장 실패 시 이전 값으로 되돌리기
                const scoreInput = this.template.querySelector(`lightning-input[data-id="${itemId}"][data-field-type="score"]`);
                if (scoreInput && this.scores[itemId] !== undefined) {
                    scoreInput.value = this.scores[itemId];
                }
            });
    }

    handleResponse(event) {
        console.log('Response change detected');
        const itemId = event.target.dataset.id;
        const questionType = event.target.dataset.questionType;
        
        console.log('Item ID:', itemId, 'Type:', questionType);

        if (questionType === 'Multi Choosable') {
            const checkboxes = this.template.querySelectorAll(`input[data-id="${itemId}"][type="checkbox"]`);
            const selectedValues = [];
            
            checkboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    selectedValues.push(checkbox.value);
                }
            });
            
            const responseValue = selectedValues.join(';');
            console.log('Multi Choosable response:', responseValue);
            
            this.responses[itemId] = responseValue;
            this.saveResponseToServer(itemId, responseValue);
        }
        else {
            const responseValue = event.target.value;
            console.log('Single choice response:', responseValue);
            
            this.responses[itemId] = responseValue;
            this.saveResponseToServer(itemId, responseValue);
        }
    }

    saveResponseToServer(itemId, answer) {
        console.log('Saving response to server:', { itemId, answer });
        
        saveResponse({ itemId: itemId, answer: answer })
            .then(result => {
                console.log('Response saved:', result);
            })
            .catch(error => {
                console.error('Error saving response:', error);
                this.showToast('응답 저장 실패', this.getErrorMessage(error), 'error');
            });
    }

    previousSection() {
        if (this.currentSectionIndex > 0) {
            this.currentSectionIndex--;
            this.currentSection = this.assessmentData.sections[this.currentSectionIndex];
            this.loadSectionResponses();
        }
    }

    nextSection() {
        if (this.currentSectionIndex < this.assessmentData.sections.length - 1) {
            this.currentSectionIndex++;
            this.currentSection = this.assessmentData.sections[this.currentSectionIndex];
            this.loadSectionResponses();
        }
    }

    submitAssessmentHandler() {
        this.isSubmitting = true;
        
        submitAssessment({ sheetId: this.recordId })
            .then(result => {
                console.log('Assessment submitted successfully:', result);
                
                this.showToast('제출 완료', result.message || '평가가 성공적으로 제출되었습니다.', 'success');
                
                setTimeout(() => {
                    if (result.navigationType === 'RECORD') {
                        // ⭐ 절대 Lightning URL로 강제 이동 (Community 환경에서도 Lightning으로 이동)
                        const currentOrigin = window.location.origin;
                        const lightningDomain = currentOrigin.replace('my.site.com', 'lightning.force.com');
                        const absoluteLightningUrl = `${lightningDomain}/lightning/r/AssessmentSheet__c/${result.recordId}/view`;
                        
                        console.log('Redirecting to:', absoluteLightningUrl);
                        window.location.href = absoluteLightningUrl;
                    } else if (result.navigationType === 'LIST') {
                        this[NavigationMixin.Navigate]({
                            type: 'standard__objectPage',
                            attributes: {
                                objectApiName: result.objectApiName,
                                actionName: 'list'
                            }
                        });
                    }
                }, 1500);
                
            })
            .catch(error => {
                console.error('Error submitting assessment:', error);
                this.showToast('제출 실패', this.getErrorMessage(error), 'error');
            })
            .finally(() => {
                this.isSubmitting = false;
            });
    }

    getErrorMessage(error) {
        if (error && error.body && error.body.message) {
            return error.body.message;
        }
        if (error && error.message) {
            return error.message;
        }
        return '알 수 없는 오류가 발생했습니다.';
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

    // ⭐ 옵션 데이터 파싱 메서드 - 실제 데이터 구조에 맞게 수정
    parseOptions(item) {
        console.log('=== parseOptions 호출 ===');
        console.log('Question ID:', item.Id);
        console.log('Question Type:', item.questionType);
        console.log('Raw item.options:', item.options);

        // 이미 배열 형태로 처리되어 있는 경우 (서버에서 가공된 데이터)
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

    // ⭐ 읽기 전용 모드 (채점 모드 예외 처리)
    get isReadOnly() {
        // 채점 모드일 때는 Complete 상태여도 편집 가능
        if (this.isGradingMode) {
            return false;
        }
        return this.isCompleted;
    }

    // ⭐ 제출 버튼 비활성화 조건 (채점 모드 예외 처리)
    get isSubmitDisabled() {
        // 채점 모드일 때는 Complete 상태여도 제출 가능
        if (this.isGradingMode) {
            return this.isSubmitting;
        }
        return this.isSubmitting || this.isCompleted;
    }

    // ⭐ 네비게이션 버튼 비활성화 조건  
    get isNavigationDisabled() {
        return this.isCompleted;
    }

    get hasAssessmentData() {
        return this.assessmentData && this.assessmentData.sections && this.assessmentData.sections.length > 0;
    }

    // ⭐ 현재 섹션 번호 (1-based)
    get currentSectionNumber() {
        return this.currentSectionIndex + 1;
    }

    // ⭐ 제출 버튼 표시 여부
    get showSubmitButton() {
        // 채점 모드이거나 Complete 상태가 아닐 때 표시
        return this.isGradingMode || !this.isCompleted;
    }

    // ⭐ 완료됨 버튼 표시 여부
    get showCompletedButton() {
        // 일반 모드에서 Complete 상태일 때만 표시
        return !this.isGradingMode && this.isCompleted;
    }

    get currentQuestions() {
        if (!this.currentSection || !this.currentSection.items) return [];
        
        return this.currentSection.items.map((item, index) => {
            // ⭐ 각 질문의 최대 점수 가져오기
            const maxScore = this.maxScores[item.Id] || item.maxScore || 100;
            
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
                scoreValue: item.Score__c || '',  // ⭐ 서버의 실제 점수만 사용 (answers와 분리)
                inputValue: item.Answer__c || '',  // 서버 답변 그대로
                maxScore: maxScore,  // ⭐ 각 질문의 최대 점수
                scoreLabel: `점수 (0-${maxScore}점)`,  // ⭐ 동적 라벨
                scoreValidationMessage: `점수는 0점부터 ${maxScore}점까지 입력 가능합니다.`,  // ⭐ 검증 메시지
                
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