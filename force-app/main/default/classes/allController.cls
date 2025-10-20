/**
 * @description       : 교육 플랫폼 대시보드 컨트롤러 - EduController 패턴 기반
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 2025-10-20
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
 **/
public with sharing class allController {
    
    // ==================================================================================
    // 📱 DASHBOARD 페이지 메서드들
    // ==================================================================================
    
    /**
 * 대시보드 데이터 조회 - Subject 단위로 반환
 */
@AuraEnabled
public static DashboardDataWrapper getDashboardData() {
    try {
        Id currentUserId = UserInfo.getUserId();
        User currentUser = [
            SELECT Id, Name, Username, Email
            FROM User
            WHERE Id = :currentUserId
            LIMIT 1
        ];

        System.debug('=== getDashboardData 시작 (CourseSubject 단위) ===');

        DashboardDataWrapper wrapper = new DashboardDataWrapper();
        wrapper.success = true;
        wrapper.message = '대시보드 데이터 조회 성공';
        wrapper.userProfile = new UserProfileWrapper(currentUser);
        wrapper.mySubjects = new List<SubjectEnrollmentWrapper>();
        wrapper.recommendedCourseSessions = new List<CourseSessionWrapper>();
        wrapper.statistics = new StatisticsWrapper();

        // 내 수강신청 조회
        List<CourseEnrollment__c> myEnrollments = [
            SELECT Id, Status__c, EnrollmentDate__c,
                   CourseSessionId__c, CourseSessionId__r.Id, CourseSessionId__r.Name,
                   CourseSessionId__r.CourseId__c, 
                   CourseSessionId__r.CourseId__r.Id,
                   CourseSessionId__r.CourseId__r.Name,
                   CourseSessionId__r.CourseId__r.ThumbnailURL__c
            FROM CourseEnrollment__c
            WHERE UserId__c = :currentUserId
            AND Status__c IN ('Approved', 'In Progress', 'Completed')
            ORDER BY EnrollmentDate__c DESC
        ];

        System.debug('수강신청 수: ' + myEnrollments.size());

        // Course와 Session 매핑
        Map<Id, CourseEnrollment__c> sessionToEnrollmentMap = new Map<Id, CourseEnrollment__c>();
        Set<Id> courseIds = new Set<Id>();
        
        for (CourseEnrollment__c enrollment : myEnrollments) {
            sessionToEnrollmentMap.put(enrollment.CourseSessionId__c, enrollment);
            if (enrollment.CourseSessionId__r.CourseId__c != null) {
                courseIds.add(enrollment.CourseSessionId__r.CourseId__c);
            }
        }

        // CourseSubject 조회 (Course당 1개씩만)
        List<CourseSubject__c> courseSubjects = [
            SELECT Id, CourseId__c, SubjectId__c, Sequence__c, IsRequired__c,
                   SubjectId__r.Id, SubjectId__r.Name, SubjectId__r.Description__c,
                   SubjectId__r.DurationHours__c, SubjectId__r.Level__c
            FROM CourseSubject__c
            WHERE CourseId__c IN :courseIds
            AND SubjectId__r.Status__c = 'Active'
            ORDER BY CourseId__c, Sequence__c
        ];

        System.debug('전체 CourseSubject 수: ' + courseSubjects.size());
 
        // CourseId별로 CourseSubject 그룹화
        Map<Id, List<CourseSubject__c>> courseToSubjectsMap = new Map<Id, List<CourseSubject__c>>();
        
        for (CourseSubject__c cs : courseSubjects) {
            if (!courseToSubjectsMap.containsKey(cs.CourseId__c)) {
                courseToSubjectsMap.put(cs.CourseId__c, new List<CourseSubject__c>());
            }
            courseToSubjectsMap.get(cs.CourseId__c).add(cs);
        }

        // Course별로 하나의 Wrapper 생성
        for (CourseEnrollment__c enrollment : myEnrollments) {
            Id courseId = enrollment.CourseSessionId__r.CourseId__c;
            List<CourseSubject__c> relatedSubjects = courseToSubjectsMap.get(courseId);
            
            if (relatedSubjects != null && !relatedSubjects.isEmpty()) {
                SubjectEnrollmentWrapper courseWrapper = new SubjectEnrollmentWrapper();
                courseWrapper.id = enrollment.Id;
                courseWrapper.courseId = courseId;
                courseWrapper.sessionId = enrollment.CourseSessionId__c;
                courseWrapper.sessionName = enrollment.CourseSessionId__r.Name;
                courseWrapper.subjectName = enrollment.CourseSessionId__r.CourseId__r.Name; // Course 이름 사용
                courseWrapper.subjectDescription = relatedSubjects[0].SubjectId__r.Description__c;
                courseWrapper.subjectThumbnail = enrollment.CourseSessionId__r.CourseId__r.ThumbnailURL__c;
                courseWrapper.enrollmentStatus = enrollment.Status__c;
                courseWrapper.progressPercentage = 0; // 클라이언트에서 계산
                
                // Subject ID 목록 저장 (진도율 계산용)
                List<String> subjectIds = new List<String>();
                for (CourseSubject__c cs : relatedSubjects) {
                    subjectIds.add(cs.SubjectId__c);
                }
                courseWrapper.subjectIdList = subjectIds;
                
                // 강사 정보 조회
                try {
                    List<Instructor__c> instructors = getCourseInstructors(courseId);
                    if (instructors != null && !instructors.isEmpty()) {
                        courseWrapper.instructor = instructors[0].Name;
                    } else {
                        courseWrapper.instructor = '강사 정보 없음';
                    }
                } catch (Exception instructorEx) {
                    courseWrapper.instructor = '강사 정보 조회 실패';
                }
                
                wrapper.mySubjects.add(courseWrapper);
            }
        }

        System.debug('생성된 Course Wrapper 수: ' + wrapper.mySubjects.size());

        // 추천 강의 조회 (기존 로직 유지)
        CourseSessionListResult courseSessions = getCourseSessions('', '', null, null, 1, 4);
        if (courseSessions.success && courseSessions.sessions != null) {
            for (CourseSession__c courseSession : courseSessions.sessions) {
                CourseSessionWrapper courseSessionWrapper = new CourseSessionWrapper(courseSession);
                
                if (courseSession.CourseId__c != null) {
                    try {
                        List<Instructor__c> instructors = getCourseInstructors(courseSession.CourseId__c);
                        if (instructors != null && !instructors.isEmpty()) {
                            courseSessionWrapper.instructor = instructors[0].Name;
                        } else {
                            courseSessionWrapper.instructor = '강사 정보 없음';
                        }
                    } catch (Exception instructorEx) {
                        courseSessionWrapper.instructor = '강사 정보 조회 실패';
                    }
                }
                
                wrapper.recommendedCourseSessions.add(courseSessionWrapper);
            }
        }

        // 통계 계산
        Integer completedCount = 0;
        Integer inProgressCount = 0;
        
        for (SubjectEnrollmentWrapper subject : wrapper.mySubjects) {
            if (subject.progressPercentage >= 100) {
                completedCount++;
            } else {
                inProgressCount++;
            }
        }
        
        wrapper.statistics = new StatisticsWrapper(completedCount, inProgressCount, wrapper.mySubjects.size(), 0);

        System.debug('✅ getDashboardData 완료 - Course 수: ' + wrapper.mySubjects.size());
        return wrapper;

    } catch (Exception e) {
        System.debug(LoggingLevel.ERROR, 'getDashboardData 오류: ' + e.getMessage());
        System.debug(LoggingLevel.ERROR, 'e.stackTrace: ' + e.getStackTraceString());
        throw new KCEDUException(e.getMessage());
    }
}

/**
 * Subject 수강 정보 Wrapper
 */
public class SubjectEnrollmentWrapper {
    @AuraEnabled public String id { get; set; }
    @AuraEnabled public String courseId { get; set; } // Course ID 
    @AuraEnabled public String subjectId { get; set; }
    @AuraEnabled public String sessionId { get; set; }
    @AuraEnabled public String sessionName { get; set; }
    @AuraEnabled public String subjectName { get; set; }
    @AuraEnabled public String subjectDescription { get; set; }
    @AuraEnabled public String subjectThumbnail { get; set; }
    @AuraEnabled public List<String> subjectIdList { get; set; } // Subject ID 목록
    @AuraEnabled public Decimal durationHours { get; set; }
    @AuraEnabled public String level { get; set; }
    @AuraEnabled public Boolean isRequired { get; set; }
    @AuraEnabled public Integer sequence { get; set; }
    @AuraEnabled public Decimal progressPercentage { get; set; }
    @AuraEnabled public String enrollmentStatus { get; set; }
    @AuraEnabled public String instructor { get; set; }
    
    public SubjectEnrollmentWrapper() {
        this.progressPercentage = 0;
        this.subjectIdList = new List<String>();
    }
}

    /**
     * 강의 세션 목록 조회 - EduController.getCourseSessions() 패턴 매칭
     */
    @AuraEnabled
    public static CourseSessionListResult getCourseSessions(String searchTerm, String status, Date startDateFrom, Date startDateTo, Integer pageNumber, Integer pageSize) {
        try {
            System.debug('=== getCourseSessions 시작 ===');
            System.debug('searchTerm: ' + searchTerm + ', status: ' + status + ', pageNumber: ' + pageNumber + ', pageSize: ' + pageSize);

            // 페이징 기본값 설정
            if (pageNumber == null || pageNumber < 1) pageNumber = 1;
            if (pageSize == null || pageSize < 1) pageSize = 10;

            Integer offset = (pageNumber - 1) * pageSize;

            // 동적 쿼리 생성
            String soqlQuery = 'SELECT Id, Name, Description__c, CourseId__c, CourseId__r.Name, CourseId__r.Category__c, ' +
                             'CourseId__r.ThumbnailURL__c, CourseId__r.Level__c, CourseId__r.DurationHours__c, ' +
                             'StartDate__c, EndDate__c, Status__c, MaxCapacity__c, CurrentEnrollment__c, Price__c, ' +
                             'RegistrationStart__c, RegistrationEnd__c ' +
                             'FROM CourseSession__c ' +
                             'WHERE Status__c IN (\'Recruiting\', \'In Progress\')';

            // 검색어 조건 추가
            if (String.isNotBlank(searchTerm)) {
                soqlQuery += ' AND (Name LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\' OR ' +
                           'CourseId__r.Name LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\')';
            }

            // 상태 조건 추가
            if (String.isNotBlank(status) && !status.equals('All')) {
                soqlQuery += ' AND Status__c = \'' + String.escapeSingleQuotes(status) + '\'';
            }

            soqlQuery += ' ORDER BY CreatedDate DESC LIMIT ' + pageSize + ' OFFSET ' + offset;

            System.debug('실행할 SOQL: ' + soqlQuery);

            List<CourseSession__c> sessions = Database.query(soqlQuery);

            System.debug('조회된 CourseSession 수: ' + sessions.size());

            return new CourseSessionListResult(true, '강의 세션 목록 조회 성공', sessions);

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'getCourseSessions 오류: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'e.stackTrace: ' + e.getStackTraceString());
            return new CourseSessionListResult(false, '강의 세션 목록을 조회할 수 없습니다: ' + e.getMessage(), new List<CourseSession__c>());
        }
    }

    // ==================================================================================
    // 📚 COURSES 페이지 메서드들
    // ==================================================================================
    
    /**
     * 수강 신청 - EduController.enrollCourse() 패턴 매칭
     */
    @AuraEnabled
    public static EnrollmentResult enrollCourse(Id sessionId) {
        try {
            Id currentUserId = UserInfo.getUserId();

            System.debug('=== enrollCourse 시작 ===');
            System.debug('sessionId: ' + sessionId);
            System.debug('currentUserId: ' + currentUserId);

            // 강의 세션 정보 조회
            CourseSession__c session = [
                SELECT Id, Name, Status__c, CourseId__c, CurrentEnrollment__c, MaxCapacity__c,
                       CourseId__r.Id, CourseId__r.Name
                FROM CourseSession__c
                WHERE Id = :sessionId
                LIMIT 1
            ];

            // 이미 수강신청했는지 확인
            List<CourseEnrollment__c> existingEnrollments = [
                SELECT Id, Status__c
                FROM CourseEnrollment__c
                WHERE UserId__c = :currentUserId
                AND CourseSessionId__c = :sessionId
                LIMIT 1
            ];

            if (!existingEnrollments.isEmpty()) {
                return new EnrollmentResult(false, '이미 수강신청한 강의입니다.', null);
            }


            // 수강신청 레코드 생성
            CourseEnrollment__c enrollment = new CourseEnrollment__c();
            enrollment.UserId__c = currentUserId;
            enrollment.CourseSessionId__c = sessionId;
            enrollment.Status__c = 'Approved'; // 자동 승인
            enrollment.EnrollmentDate__c = System.now();
            enrollment.PaymentStatus__c = 'Completed';
            System.debug('수강신청 레코드 생성 시도 (기본 필드만): ' + enrollment);
            
            // 먼저 기본 필드만으로 insert 시도
            Boolean insertSuccess = false;
            String errorMessage = '';
            
            try {
                insert enrollment;
                insertSuccess = true;
                System.debug('✅ 수강신청 레코드 생성 성공 (PaymentStatus 없이)');
            } catch (Exception e) {
                errorMessage = e.getMessage();
                System.debug('❌ 기본 필드 insert 실패: ' + errorMessage);
                
                // PaymentStatus 필드가 필수인 경우, 가능한 값들로 재시도
                if (errorMessage.contains('PaymentStatus') || errorMessage.contains('Payment_Status')) {
                    System.debug('PaymentStatus 필드 필수 - 가능한 값으로 재시도');
                    
                    // 일반적인 picklist 값들 시도
                    List<String> possibleValues = new List<String>{
                        'Paid',           // 유료 결제 완료
                        'Pending',        // 결제 대기
                        'Completed',      // 완료
                        'Approved',       // 승인됨
                        'Free',           // 무료
                        'Not Required',   // 필요없음
                        'Waived',         // 면제
                        'N/A'             // 해당없음
                    };
                    
                    for (String value : possibleValues) {
                        try {
                            enrollment = new CourseEnrollment__c();
                            enrollment.UserId__c = currentUserId;
                            enrollment.CourseSessionId__c = sessionId;
                            enrollment.Status__c = 'Approved';
                            enrollment.EnrollmentDate__c = System.now();
                            enrollment.put('PaymentStatus__c', value);
                            
                            insert enrollment;
                            insertSuccess = true;
                            System.debug('✅ PaymentStatus=' + value + '로 수강신청 성공');
                            break;
                        } catch (Exception ex) {
                            System.debug('PaymentStatus=' + value + ' 실패: ' + ex.getMessage());
                            continue;
                        }
                    }
                }
            }
            
            if (!insertSuccess) {
                return new EnrollmentResult(false, '수강신청 레코드를 생성할 수 없습니다. 오류: ' + errorMessage, null);
            }

            // 현재 수강생 수 업데이트
            session.CurrentEnrollment__c = (session.CurrentEnrollment__c != null ? session.CurrentEnrollment__c : 0) + 1;
            update session;

            System.debug('✅ 수강신청 완료: ' + enrollment.Id);

            return new EnrollmentResult(true, '수강신청이 완료되었습니다.', enrollment);

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'enrollCourse 오류: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'e.stackTrace: ' + e.getStackTraceString());
            return new EnrollmentResult(false, '수강신청 중 오류가 발생했습니다: ' + e.getMessage(), null);
        }
    }

    /**
     * 수강신청 상태 확인
     */
    @AuraEnabled
    public static Boolean getCourseEnrollmentStatus(Id sessionId) {
        try {
            Id currentUserId = UserInfo.getUserId();
            
            List<CourseEnrollment__c> enrollments = [
                SELECT Id, Status__c
                FROM CourseEnrollment__c
                WHERE UserId__c = :currentUserId
                AND CourseSessionId__c = :sessionId
                AND Status__c IN ('Approved', 'In Progress', 'Completed')
                LIMIT 1
            ];

            return !enrollments.isEmpty();

        } catch (Exception e) {
            System.debug('getCourseEnrollmentStatus 오류: ' + e.getMessage());
            return false;
        }
    }

    /**
     * 강의별 강사 목록 조회 - EduController.getCourseInstructors() 패턴 매칭
     */
    @AuraEnabled
    public static List<Instructor__c> getCourseInstructors(Id courseId) {
        try {
            // Get course session IDs using a Set for better performance
            Set<Id> courseSessionIds = new Map<Id, CourseSession__c>([
                    SELECT Id
                    FROM CourseSession__c
                    WHERE CourseId__c = :courseId
            ]).keySet();

            // Extract instructor IDs from InstructorCourse__c records
            List<InstructorCourse__c> instructorCourses = [
                    SELECT InstructorId__c
                    FROM InstructorCourse__c
                    WHERE CourseSessionId__c IN :courseSessionIds
            ];

            Set<Id> instructorIds = new Set<Id>();
            for (InstructorCourse__c ic : instructorCourses) {
                if (ic.InstructorId__c != null) {
                    instructorIds.add(ic.InstructorId__c);
                }
            }

            return [
                    SELECT Id, Name, Email__c, Phone__c,
                            Specialization__c, ProfileImageURL__c,
                            YearsOfExperience__c, Certifications__c, Status__c,
                            CreatedDate, LastModifiedDate
                    FROM Instructor__c
                    WHERE Id IN :instructorIds
            ];
        } catch (Exception e) {
            throw new KCEDUException('강사 목록을 조회할 수 없습니다: ' + e.getMessage());
        }
    }

    // ==================================================================================
    // 🎬 LESSON PLAYER 페이지 메서드들
    // ==================================================================================
    
    /**
     * 실제 Lesson__c의 ContentType__c 필드 기반으로 콘텐츠 반환
     */
    @AuraEnabled
    public static List<Map<String, Object>> getLessonContents(Id lessonId) {
        try {
            Id currentUserId = UserInfo.getUserId();
            System.debug('=== 강화된 getLessonContents 시작 ===');
            System.debug('lessonId: ' + lessonId + ', 사용자: ' + currentUserId);

            // Step 0: 입력값 유효성 검사
            if (lessonId == null) {
                System.debug('❌ lessonId가 null입니다.');
                return new List<Map<String, Object>>();
            }

            // Step 1: 직접 연결된 ContentDocumentLink 찾기
            List<ContentDocumentLink> cdLinks;
            try {
                cdLinks = [
                        SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
                        FROM ContentDocumentLink
                        WHERE LinkedEntityId = :lessonId
                        ORDER BY SystemModstamp DESC
                ];
                System.debug('Step 1 - 직접 ContentDocumentLink 조회 성공: ' + cdLinks.size() + '개');
            } catch (Exception queryEx) {
                System.debug('❌ ContentDocumentLink 쿼리 실패: ' + queryEx.getMessage());
                cdLinks = new List<ContentDocumentLink>();
            }

            // Step 2: 직접 연결이 없으면 관련 레코드 검색
            if (cdLinks.isEmpty()) {
                System.debug('⚠️ 직접 연결된 파일이 없음. 관련 레코드 검색 시도...');
                
                // Subject와 Lesson 관계 확인하여 개별적으로 검색
                try {
                    List<Lesson__c> lessons = [SELECT Id, SubjectId__c FROM Lesson__c WHERE Id = :lessonId OR SubjectId__c = :lessonId];
                    
                    for (Lesson__c lesson : lessons) {
                        if (lesson.SubjectId__c != null && lesson.SubjectId__c != lessonId) {
                            // ...existing code...
                        }
                    }
                    
                    System.debug('Step 1.2 - 확장 검색 결과: ' + cdLinks.size() + '개');
                } catch (Exception e) {
                    System.debug('관련 레코드 검색 실패: ' + e.getMessage());
                }
            }

            if (cdLinks.isEmpty()) {
                System.debug('❌ lessonId ' + lessonId + '에 연결된 파일이 전혀 없습니다.');
                System.debug('❌ 확인사항:');
                System.debug('   1. Salesforce Files에서 해당 레코드에 파일이 첨부되어 있는가?');
                System.debug('   2. ContentDocumentLink 관계가 올바르게 생성되었는가?');
                System.debug('   3. lessonId가 올바른 Salesforce ID인가?');
                System.debug('   4. Subject와 Lesson 관계가 올바르게 설정되어 있는가?');
                
                return new List<Map<String, Object>>();
            }

            // Step 3: ContentDocument ID들 수집
            Set<Id> contentDocumentIds = new Set<Id>();
            if (cdLinks != null && !cdLinks.isEmpty()) {
                for (ContentDocumentLink link : cdLinks) {
                    if (link.ContentDocumentId != null) {
                        contentDocumentIds.add(link.ContentDocumentId);
                        System.debug('  - ContentDocument: ' + link.ContentDocumentId + ' (Entity: ' + link.LinkedEntityId + ')');
                    }
                }
            }
            
            if (contentDocumentIds.isEmpty()) {
                System.debug('❌ ContentDocumentId가 없습니다.');
                return new List<Map<String, Object>>();
            }

            // Step 4: ContentVersion 조회
            List<ContentVersion> allVersions;
            try {
                allVersions = [
                        SELECT Id, Title, Description, ContentUrl, VersionDataUrl, 
                               FileType, FileExtension, ContentSize, PathOnClient,
                               CreatedDate, ContentDocumentId, IsLatest
                        FROM ContentVersion
                        WHERE ContentDocumentId IN :contentDocumentIds
                        AND IsLatest = TRUE
                        ORDER BY CreatedDate DESC
                ];
                System.debug('Step 4 - ContentVersion 조회 성공: ' + allVersions.size() + '개');
            } catch (Exception cvEx) {
                System.debug('❌ ContentVersion 쿼리 실패: ' + cvEx.getMessage());
                allVersions = new List<ContentVersion>();
            }

            System.debug('Step 2 - ContentVersion 조회: ' + allVersions.size() + '개');

            if (allVersions.isEmpty()) {
                System.debug('❌ ContentVersion이 없습니다.');
                return new List<Map<String, Object>>();
            }

            // Step 5: 각 파일 상세 정보 출력
            for (ContentVersion cv : allVersions) {
                System.debug('📄 파일: ' + cv.Title + ' (' + cv.FileExtension + ', ' + cv.ContentSize + ' bytes)');
                System.debug('  - ContentUrl: ' + cv.ContentUrl);
                System.debug('  - VersionDataUrl: ' + cv.VersionDataUrl);
            }

            // Step 6: LessonProgress 확인/생성
            List<LessonProgress__c> lessonProgressList;
            try {
                lessonProgressList = [
                        SELECT Id FROM LessonProgress__c
                        WHERE LessonId__c = :lessonId AND UserId__c = :currentUserId
                        LIMIT 1
                ];
                System.debug('기존 LessonProgress 조회: ' + lessonProgressList.size() + '개');
            } catch (Exception lpEx) {
                System.debug('❌ LessonProgress 쿼리 실패: ' + lpEx.getMessage());
                lessonProgressList = new List<LessonProgress__c>();
            }

            if (lessonProgressList.isEmpty()) {
                try {
                    LessonProgress__c newProgress = new LessonProgress__c(
                            LessonId__c = lessonId,
                            UserId__c = currentUserId,
                            ProgressPercentage__c = 0,
                            StartDate__c = System.now(),
                            Status__c = 'NotStarted',
                            TimeSpentMinutes__c = 0,
                            AccessCount__c = 1
                    );
                    insert newProgress;
                    lessonProgressList.add(newProgress);
                    System.debug('새 LessonProgress 생성 성공: ' + newProgress.Id);
                } catch (Exception insertEx) {
                    System.debug('❌ LessonProgress 생성 실패: ' + insertEx.getMessage());
                    // 실패해도 계속 진행
                    lessonProgressList = new List<LessonProgress__c>();
                }
            }

            Id lessonProgressId = lessonProgressList[0].Id;

            // Step 7: VideoProgress 조회
            Map<Id, VideoProgress__c> existingProgressMap = new Map<Id, VideoProgress__c>();
            List<VideoProgress__c> existingVideoProgress = [
                    SELECT Id, ContentVersionId__c, CurrentTimeSeconds__c, TotalTimeSeconds__c,
                           ProgressPercentage__c, Completed__c, LastWatched__c, PlaybackSpeed__c,
                           User__c, LessonProgress__c
                    FROM VideoProgress__c
                    WHERE LessonProgress__c = :lessonProgressId
                    AND User__c = :currentUserId
            ];

            for (VideoProgress__c vp : existingVideoProgress) {
                if (vp.ContentVersionId__c != null) {
                    existingProgressMap.put(vp.ContentVersionId__c, vp);
                }
            }

            System.debug('기존 VideoProgress: ' + existingProgressMap.size() + '개');

            // Step 8: 결과 생성
            List<Map<String, Object>> result = new List<Map<String, Object>>();
            List<VideoProgress__c> toInsert = new List<VideoProgress__c>();

            for (ContentVersion cv : allVersions) {
                VideoProgress__c videoProgress;

                if (existingProgressMap.containsKey(cv.Id)) {
                    videoProgress = existingProgressMap.get(cv.Id);
                } else {
                    videoProgress = new VideoProgress__c(
                            ContentVersionId__c = cv.Id,
                            CurrentTimeSeconds__c = 0,
                            TotalTimeSeconds__c = 0,
                            ProgressPercentage__c = 0,
                            Completed__c = false,
                            PlaybackSpeed__c = 1.0,
                            User__c = currentUserId,
                            LessonProgress__c = lessonProgressId
                    );
                    toInsert.add(videoProgress);
                }

                // 결과 맵 생성
                Map<String, Object> contentMap = new Map<String, Object>();
                contentMap.put('Id', cv.Id);
                contentMap.put('ContentVersionId__c', cv.Id);
                contentMap.put('Title', cv.Title);
                contentMap.put('Description', cv.Description);
                contentMap.put('FileExtension', cv.FileExtension);
                contentMap.put('ContentSize', cv.ContentSize);
                contentMap.put('PathOnClient', cv.PathOnClient);
                contentMap.put('CreatedDate', cv.CreatedDate);
                contentMap.put('ContentUrl', cv.ContentUrl);
                contentMap.put('VersionDataUrl', cv.VersionDataUrl);
                
                // VideoProgress 정보
                contentMap.put('VideoProgressId', videoProgress.Id);
                contentMap.put('CurrentTimeSeconds__c', videoProgress.CurrentTimeSeconds__c);
                contentMap.put('TotalTimeSeconds__c', videoProgress.TotalTimeSeconds__c);
                contentMap.put('ProgressPercentage__c', videoProgress.ProgressPercentage__c);
                contentMap.put('Completed__c', videoProgress.Completed__c);
                contentMap.put('PlaybackSpeed__c', videoProgress.PlaybackSpeed__c);
                contentMap.put('LastWatched__c', videoProgress.LastWatched__c);
                
                    // 파일이 비디오인지 여부 추가
                    Boolean isVideo = isVideoFile(cv.FileExtension);
                    contentMap.put('isVideo', isVideo);
                    // URL 우선순위: VersionDataUrl > ContentUrl (비디오 파일만 videoUrl 세팅)
                    String videoUrl = (isVideo && cv.VersionDataUrl != null) ? cv.VersionDataUrl : (isVideo ? cv.ContentUrl : null);
                    contentMap.put('videoUrl', videoUrl);
                    contentMap.put('fileUrl', videoUrl);
                    result.add(contentMap);
            }

            // Step 9: 새 VideoProgress 저장
            if (!toInsert.isEmpty()) {
                insert toInsert;
                System.debug('새 VideoProgress ' + toInsert.size() + '개 저장 완료');
            }

            System.debug('=== getLessonContents 완료 ===');
            System.debug('최종 반환 결과: ' + result.size() + '개 콘텐츠');
            
            return result;

        } catch (Exception e) {
            System.debug('❌ getLessonContents 심각한 오류 발생 ===');
            System.debug('❌ 오류 타입: ' + e.getTypeName());
            System.debug('❌ 오류 메시지: ' + e.getMessage());
            System.debug('❌ 오류 라인: ' + e.getLineNumber());
            System.debug('❌ 스택 추적: ' + e.getStackTraceString());
            System.debug('❌ lessonId: ' + lessonId);
            System.debug('❌ 사용자 ID: ' + UserInfo.getUserId());
            
            // 안전한 기본값 반환 (예외를 던지지 않고)
            return new List<Map<String, Object>>();
        }
    }
    
    /**
     * 파일 확장자로 비디오 파일 여부 판단
     */
    private static Boolean isVideoFile(String fileExtension) {
        if (String.isBlank(fileExtension)) return false;
        
        Set<String> videoExtensions = new Set<String>{
            'mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp'
        };
        
        return videoExtensions.contains(fileExtension.toLowerCase());
    }
    
    // ==================================================================================
    // 🧪 테스트 데이터 메서드들
    // ==================================================================================
    
    /**
     * ⚠️ EduController 방식 - 실제 ContentVersion URL 사용
     * 실제 운영에서는 Salesforce Files(ContentVersion)에 업로드된 비디오 사용
     */
    private static List<Map<String, Object>> createTestVideoContent() {
        List<Map<String, Object>> testData = new List<Map<String, Object>>();
        
        // 실제 재생 가능한 테스트 영상 1 - Sintel (더 확실한 URL)
        Map<String, Object> video1 = new Map<String, Object>();
        video1.put('Id', 'VIDEO001');
        video1.put('ContentVersionId__c', 'VIDEO001');
        video1.put('Title', '스노우플레이크 기초 - 데이터 웨어하우스 개념');
        video1.put('Description', '스노우플레이크의 기본 개념과 아키텍처를 학습합니다.');
        video1.put('FileExtension', 'mp4');
        video1.put('videoUrl', 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4');
        video1.put('fileUrl', 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4');
        video1.put('VersionDataUrl', 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4');
        video1.put('ContentUrl', 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4');
        video1.put('isVideo', true);
        video1.put('estimatedDuration', 30); // 30초
        video1.put('fileSizeMB', 1);
        testData.add(video1);
        
        // 대안 URL로 두 번째 비디오
        Map<String, Object> video2 = new Map<String, Object>();
        video2.put('Id', 'VIDEO002');
        video2.put('ContentVersionId__c', 'VIDEO002');
        video2.put('Title', '스노우플레이크 SQL 기본');
        video2.put('Description', '스노우플레이크에서 기본적인 SQL 쿼리 작성 방법을 배웁니다.');
        video2.put('FileExtension', 'mp4');
        video2.put('videoUrl', 'https://www.w3schools.com/html/mov_bbb.mp4');
        video2.put('fileUrl', 'https://www.w3schools.com/html/mov_bbb.mp4');
        video2.put('VersionDataUrl', 'https://www.w3schools.com/html/mov_bbb.mp4');
        video2.put('ContentUrl', 'https://www.w3schools.com/html/mov_bbb.mp4');
        video2.put('isVideo', true);
        video2.put('estimatedDuration', 10); // 10초
        video2.put('fileSizeMB', 1);
        testData.add(video2);
        
        // Google 샘플 비디오 (원래것)
        Map<String, Object> video3 = new Map<String, Object>();
        video3.put('Id', 'VIDEO003');
        video3.put('ContentVersionId__c', 'VIDEO003');
        video3.put('Title', '스노우플레이크 고급 기능');
        video3.put('Description', '스노우플레이크의 고급 기능과 최적화 기법을 학습합니다.');
        video3.put('FileExtension', 'mp4');
        video3.put('videoUrl', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
        video3.put('fileUrl', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
        video3.put('VersionDataUrl', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
        video3.put('ContentUrl', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
        video3.put('isVideo', true);
        video3.put('estimatedDuration', 596); // 9분 56초
        video3.put('fileSizeMB', 15);
        testData.add(video3);
        
        System.debug('실제 재생 가능한 테스트 데이터 생성: ' + testData.size() + '개');
        return testData;
    }
    
    /**
     * 테스트용 콘텐츠 생성 (기존 메서드 유지)
     */
    private static List<Map<String, Object>> createTestContent() {
        List<Map<String, Object>> testData = new List<Map<String, Object>>();
        
        // 테스트 비디오 1 (실제로는 이미지지만 비디오로 표시)
        Map<String, Object> video1 = new Map<String, Object>();
        video1.put('Id', 'TEST_VIDEO_001');
        video1.put('ContentVersionId__c', 'TEST_VIDEO_001');
        video1.put('Title', '스노우플레이크 기초 강의');
        video1.put('Description', '스노우플레이크 데이터 웨어하우스 기본 개념을 학습합니다');
        video1.put('FileExtension', 'mp4');
        video1.put('videoUrl', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
        video1.put('isVideo', true);
        video1.put('estimatedDuration', 1800); // 30분
        video1.put('fileSizeMB', 158.0);
        testData.add(video1);
        
        // 테스트 비디오 2
        Map<String, Object> video2 = new Map<String, Object>();
        video2.put('Id', 'TEST_VIDEO_002');
        video2.put('ContentVersionId__c', 'TEST_VIDEO_002');
        video2.put('Title', '스노우플레이크 고급 쿼리 기법');
        video2.put('Description', '복잡한 SQL 쿼리 작성 방법과 최적화 기법');
        video2.put('FileExtension', 'mp4');
        video2.put('videoUrl', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4');
        video2.put('isVideo', true);
        video2.put('estimatedDuration', 2400); // 40분
        video2.put('fileSizeMB', 245.0);
        testData.add(video2);
        
        // 테스트 비디오 3
        Map<String, Object> video3 = new Map<String, Object>();
        video3.put('Id', 'TEST_VIDEO_003');
        video3.put('ContentVersionId__c', 'TEST_VIDEO_003');
        video3.put('Title', '스노우플레이크 데이터 로딩');
        video3.put('Description', '다양한 데이터 소스에서 스노우플레이크로 데이터를 로드하는 방법');
        video3.put('FileExtension', 'mp4');
        video3.put('videoUrl', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
        video3.put('isVideo', true);
        video3.put('estimatedDuration', 1500); // 25분
        video3.put('fileSizeMB', 187.0);
        testData.add(video3);
        
        System.debug('테스트 데이터 생성 완료: ' + testData.size() + '개');
        return testData;
    }

    
    /**
     * Subject의 상세 정보와 콘텐츠를 함께 조회하는 헬퍼 메서드
     */
    @AuraEnabled
    public static Map<String, Object> getSubjectWithContents(Id subjectId) {
        System.debug('=== getSubjectWithContents 시작 ===');
        
        try {
            // Subject 정보 조회
            Subject__c subject = [
                SELECT Id, Name, Description__c, Level__c, DurationHours__c,
                       LearningObjectives__c, Status__c, SubjectType__c
                FROM Subject__c
                WHERE Id = :subjectId
                LIMIT 1
            ];
            
            // Subject의 콘텐츠 조회
            List<Map<String, Object>> contents = getLessonContents(subjectId);
            
            Map<String, Object> result = new Map<String, Object>();
            result.put('subject', subject);
            result.put('contents', contents);
            result.put('contentCount', contents.size());
            result.put('hasVideos', false);
            
            // 비디오 파일이 있는지 확인
            for (Map<String, Object> content : contents) {
                Boolean isVideo = (Boolean) content.get('isVideo');
                if (isVideo == true) {
                    result.put('hasVideos', true);
                    break;
                }
            }
            
            System.debug('✅ Subject with Contents 조회 완료: ' + subject.Name + ' (' + contents.size() + '개 콘텐츠)');
            return result;
            
        } catch (Exception e) {
            System.debug('❌ getSubjectWithContents 오류: ' + e.getMessage());
            throw new AuraHandledException('Subject 정보를 조회할 수 없습니다: ' + e.getMessage());
        }
    }

    /**
     * 기존 복잡한 메서드 - 백업용
     */
    @AuraEnabled
    public static List<Map<String, Object>> getLessonContents_Old(Id lessonId) {
        try {
            Id currentUserId = UserInfo.getUserId();
            System.debug('=== 강화된 getLessonContents 시작 ===');
            System.debug('lessonId: ' + lessonId + ', 사용자: ' + currentUserId);

            // Step 0: 입력값 유효성 검사
            if (lessonId == null) {
                System.debug('❌ lessonId가 null입니다.');
                return new List<Map<String, Object>>();
            }

            // Step 1: 직접 연결된 ContentDocumentLink 찾기
            List<ContentDocumentLink> cdLinks;
            try {
                cdLinks = [
                        SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
                        FROM ContentDocumentLink
                        WHERE LinkedEntityId = :lessonId
                        ORDER BY SystemModstamp DESC
                ];
                System.debug('Step 1 - 직접 ContentDocumentLink 조회 성공: ' + cdLinks.size() + '개');
            } catch (Exception queryEx) {
                System.debug('❌ ContentDocumentLink 쿼리 실패: ' + queryEx.getMessage());
                cdLinks = new List<ContentDocumentLink>();
            }

            // Step 2: 직접 연결이 없으면 관련 레코드 검색
            if (cdLinks.isEmpty()) {
                System.debug('⚠️ 직접 연결된 파일이 없음. 관련 레코드 검색 시도...');
                
                // Subject와 Lesson 관계 확인하여 개별적으로 검색
                try {
                    List<Lesson__c> lessons = [SELECT Id, SubjectId__c FROM Lesson__c WHERE Id = :lessonId OR SubjectId__c = :lessonId];
                    
                    for (Lesson__c lesson : lessons) {
                        // 각 관련 ID별로 개별 쿼리 수행 (ContentDocumentLink 제약 조건 준수)
                        if (lesson.Id != lessonId) {
                            List<ContentDocumentLink> lessonLinks = [
                                    SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
                                    FROM ContentDocumentLink
                                    WHERE LinkedEntityId = :lesson.Id
                                    ORDER BY SystemModstamp DESC
                            ];
                            cdLinks.addAll(lessonLinks);
                            System.debug('Lesson ' + lesson.Id + '에서 ' + lessonLinks.size() + '개 파일 발견');
                        }
                        
                        if (lesson.SubjectId__c != null && lesson.SubjectId__c != lessonId) {
                            List<ContentDocumentLink> subjectLinks = [
                                    SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
                                    FROM ContentDocumentLink
                                    WHERE LinkedEntityId = :lesson.SubjectId__c
                                    ORDER BY SystemModstamp DESC
                            ];
                            cdLinks.addAll(subjectLinks);
                            System.debug('Subject ' + lesson.SubjectId__c + '에서 ' + subjectLinks.size() + '개 파일 발견');
                        }
                    }
                    
                    System.debug('Step 1.2 - 확장 검색 결과: ' + cdLinks.size() + '개');
                } catch (Exception e) {
                    System.debug('관련 레코드 검색 실패: ' + e.getMessage());
                }
            }

            if (cdLinks.isEmpty()) {
                System.debug('❌ lessonId ' + lessonId + '에 연결된 파일이 전혀 없습니다.');
                System.debug('❌ 확인사항:');
                System.debug('   1. Salesforce Files에서 해당 레코드에 파일이 첨부되어 있는가?');
                System.debug('   2. ContentDocumentLink 관계가 올바르게 생성되었는가?');
                System.debug('   3. lessonId가 올바른 Salesforce ID인가?');
                System.debug('   4. Subject와 Lesson 관계가 올바르게 설정되어 있는가?');
                
                return new List<Map<String, Object>>();
            }

            // Step 3: ContentDocument ID들 수집
            Set<Id> contentDocumentIds = new Set<Id>();
            if (cdLinks != null && !cdLinks.isEmpty()) {
                for (ContentDocumentLink link : cdLinks) {
                    if (link.ContentDocumentId != null) {
                        contentDocumentIds.add(link.ContentDocumentId);
                        System.debug('  - ContentDocument: ' + link.ContentDocumentId + ' (Entity: ' + link.LinkedEntityId + ')');
                    }
                }
            }
            
            if (contentDocumentIds.isEmpty()) {
                System.debug('❌ ContentDocumentId가 없습니다.');
                return new List<Map<String, Object>>();
            }

            // Step 4: ContentVersion 조회
            List<ContentVersion> allVersions;
            try {
                allVersions = [
                        SELECT Id, Title, Description, ContentUrl, VersionDataUrl, 
                               FileType, FileExtension, ContentSize, PathOnClient,
                               CreatedDate, ContentDocumentId, IsLatest
                        FROM ContentVersion
                        WHERE ContentDocumentId IN :contentDocumentIds
                        AND IsLatest = TRUE
                        ORDER BY CreatedDate DESC
                ];
                System.debug('Step 4 - ContentVersion 조회 성공: ' + allVersions.size() + '개');
            } catch (Exception cvEx) {
                System.debug('❌ ContentVersion 쿼리 실패: ' + cvEx.getMessage());
                allVersions = new List<ContentVersion>();
            }

            System.debug('Step 2 - ContentVersion 조회: ' + allVersions.size() + '개');

            if (allVersions.isEmpty()) {
                System.debug('❌ ContentVersion이 없습니다.');
                return new List<Map<String, Object>>();
            }

            // Step 5: 각 파일 상세 정보 출력
            for (ContentVersion cv : allVersions) {
                System.debug('📄 파일: ' + cv.Title + ' (' + cv.FileExtension + ', ' + cv.ContentSize + ' bytes)');
                System.debug('  - ContentUrl: ' + cv.ContentUrl);
                System.debug('  - VersionDataUrl: ' + cv.VersionDataUrl);
            }

            // Step 6: LessonProgress 확인/생성
            List<LessonProgress__c> lessonProgressList;
            try {
                lessonProgressList = [
                        SELECT Id FROM LessonProgress__c
                        WHERE LessonId__c = :lessonId AND UserId__c = :currentUserId
                        LIMIT 1
                ];
                System.debug('기존 LessonProgress 조회: ' + lessonProgressList.size() + '개');
            } catch (Exception lpEx) {
                System.debug('❌ LessonProgress 쿼리 실패: ' + lpEx.getMessage());
                lessonProgressList = new List<LessonProgress__c>();
            }

            if (lessonProgressList.isEmpty()) {
                try {
                    LessonProgress__c newProgress = new LessonProgress__c(
                            LessonId__c = lessonId,
                            UserId__c = currentUserId,
                            ProgressPercentage__c = 0,
                            StartDate__c = System.now(),
                            Status__c = 'NotStarted',
                            TimeSpentMinutes__c = 0,
                            AccessCount__c = 1
                    );
                    insert newProgress;
                    lessonProgressList.add(newProgress);
                    System.debug('새 LessonProgress 생성 성공: ' + newProgress.Id);
                } catch (Exception insertEx) {
                    System.debug('❌ LessonProgress 생성 실패: ' + insertEx.getMessage());
                    // 실패해도 계속 진행
                    lessonProgressList = new List<LessonProgress__c>();
                }
            }

            Id lessonProgressId = lessonProgressList[0].Id;

            // Step 7: VideoProgress 조회
            Map<Id, VideoProgress__c> existingProgressMap = new Map<Id, VideoProgress__c>();
            List<VideoProgress__c> existingVideoProgress = [
                    SELECT Id, ContentVersionId__c, CurrentTimeSeconds__c, TotalTimeSeconds__c,
                           ProgressPercentage__c, Completed__c, LastWatched__c, PlaybackSpeed__c,
                           User__c, LessonProgress__c
                    FROM VideoProgress__c
                    WHERE LessonProgress__c = :lessonProgressId
                    AND User__c = :currentUserId
            ];

            for (VideoProgress__c vp : existingVideoProgress) {
                if (vp.ContentVersionId__c != null) {
                    existingProgressMap.put(vp.ContentVersionId__c, vp);
                }
            }

            System.debug('기존 VideoProgress: ' + existingProgressMap.size() + '개');

            // Step 8: 결과 생성
            List<Map<String, Object>> result = new List<Map<String, Object>>();
            List<VideoProgress__c> toInsert = new List<VideoProgress__c>();

            for (ContentVersion cv : allVersions) {
                VideoProgress__c videoProgress;

                if (existingProgressMap.containsKey(cv.Id)) {
                    videoProgress = existingProgressMap.get(cv.Id);
                } else {
                    videoProgress = new VideoProgress__c(
                            ContentVersionId__c = cv.Id,
                            CurrentTimeSeconds__c = 0,
                            TotalTimeSeconds__c = 0,
                            ProgressPercentage__c = 0,
                            Completed__c = false,
                            PlaybackSpeed__c = 1.0,
                            User__c = currentUserId,
                            LessonProgress__c = lessonProgressId
                    );
                    toInsert.add(videoProgress);
                }

                // 결과 맵 생성
                Map<String, Object> contentMap = new Map<String, Object>();
                contentMap.put('Id', cv.Id);
                contentMap.put('ContentVersionId__c', cv.Id);
                contentMap.put('Title', cv.Title);
                contentMap.put('Description', cv.Description);
                contentMap.put('FileExtension', cv.FileExtension);
                contentMap.put('ContentSize', cv.ContentSize);
                contentMap.put('PathOnClient', cv.PathOnClient);
                contentMap.put('CreatedDate', cv.CreatedDate);
                contentMap.put('ContentUrl', cv.ContentUrl);
                contentMap.put('VersionDataUrl', cv.VersionDataUrl);
                
                // VideoProgress 정보
                contentMap.put('VideoProgressId', videoProgress.Id);
                contentMap.put('CurrentTimeSeconds__c', videoProgress.CurrentTimeSeconds__c);
                contentMap.put('TotalTimeSeconds__c', videoProgress.TotalTimeSeconds__c);
                contentMap.put('ProgressPercentage__c', videoProgress.ProgressPercentage__c);
                contentMap.put('Completed__c', videoProgress.Completed__c);
                contentMap.put('PlaybackSpeed__c', videoProgress.PlaybackSpeed__c);
                contentMap.put('LastWatched__c', videoProgress.LastWatched__c);
                
                // URL 우선순위: VersionDataUrl > ContentUrl
                String videoUrl = cv.VersionDataUrl != null ? cv.VersionDataUrl : cv.ContentUrl;
                contentMap.put('videoUrl', videoUrl);
                contentMap.put('fileUrl', videoUrl);
                
                result.add(contentMap);
            }

            // Step 9: 새 VideoProgress 저장
            if (!toInsert.isEmpty()) {
                insert toInsert;
                System.debug('새 VideoProgress ' + toInsert.size() + '개 저장 완료');
            }

            System.debug('=== getLessonContents 완료 ===');
            System.debug('최종 반환 결과: ' + result.size() + '개 콘텐츠');
            
            return result;

        } catch (Exception e) {
            System.debug('❌ getLessonContents 심각한 오류 발생 ===');
            System.debug('❌ 오류 타입: ' + e.getTypeName());
            System.debug('❌ 오류 메시지: ' + e.getMessage());
            System.debug('❌ 오류 라인: ' + e.getLineNumber());
            System.debug('❌ 스택 추적: ' + e.getStackTraceString());
            System.debug('❌ lessonId: ' + lessonId);
            System.debug('❌ 사용자 ID: ' + UserInfo.getUserId());
            
            // 안전한 기본값 반환 (예외를 던지지 않고)
            return new List<Map<String, Object>>();
        }
    }

    /**
     * ContentVersion 상세 조회
     */
    @AuraEnabled
    public static ContentVersion getContentDetail(Id contentVersionId) {
        try {
            return [
                    SELECT Id, Title, Description, ContentUrl, FileType, ContentSize,
                            FileExtension, CreatedDate, LastModifiedDate
                    FROM ContentVersion
                    WHERE Id = :contentVersionId
                    LIMIT 1
            ];
        } catch (Exception e) {
            throw new KCEDUException('콘텐츠 상세 정보를 조회할 수 없습니다: ' + e.getMessage());
        }
    }

    /**
     * Lesson에 해당하는 비디오 URL 조회 (Player용 - 제목 기반)
     */
    @AuraEnabled
    public static Map<String, Object> getLessonVideoData(Id lessonId) {
        try {
            // Lesson 정보 조회
            Lesson__c lesson = [
                    SELECT Id, Name, Description__c, DurationMinutes__c
                    FROM Lesson__c
                    WHERE Id = :lessonId
                    LIMIT 1
            ];

            // ContentVersion 검색 (제목 기반 - 정확한 매칭)
            List<ContentVersion> videos = [
                    SELECT Id, Title, Description, ContentUrl, ContentDocumentId
                    FROM ContentVersion
                    WHERE Title = :lesson.Name
                    AND IsLatest = TRUE
                    AND ContentLocation = 'E'
                    LIMIT 1
            ];

            // 정확한 매칭이 없으면 유사 검색
            if (videos.isEmpty()) {
                videos = [
                        SELECT Id, Title, Description, ContentUrl, ContentDocumentId
                        FROM ContentVersion
                        WHERE Title LIKE :('%' + lesson.Name + '%')
                        AND IsLatest = TRUE
                        AND ContentLocation = 'E'
                        LIMIT 1
                ];
            }

            Map<String, Object> result = new Map<String, Object>();
            result.put('lesson', lesson);
            result.put('hasVideo', !videos.isEmpty());
            result.put('video', videos.isEmpty() ? null : videos[0]);
            result.put('videoUrl', videos.isEmpty() ? null : videos[0].ContentUrl);

            return result;

        } catch (Exception e) {
            throw new KCEDUException('레슨 비디오 조회 실패: ' + e.getMessage());
        }
    }

    /**
     * 제목으로 비디오 직접 검색 (간단한 방법)
     */
    @AuraEnabled
    public static ContentVersion getLessonVideoByTitle(String lessonTitle) {
        try {
            List<ContentVersion> videos = [
                    SELECT Id, Title, Description, ContentUrl, ContentDocumentId
                    FROM ContentVersion
                    WHERE Title = :lessonTitle
                    AND IsLatest = TRUE
                    AND ContentLocation = 'E'
                    LIMIT 1
            ];

            if (!videos.isEmpty()) {
                return videos[0];
            }

            // 정확한 매칭이 없으면 LIKE 검색
            videos = [
                    SELECT Id, Title, Description, ContentUrl, ContentDocumentId
                    FROM ContentVersion
                    WHERE Title LIKE :('%' + lessonTitle + '%')
                    AND IsLatest = TRUE
                    AND ContentLocation = 'E'
                    LIMIT 1
            ];

            return videos.isEmpty() ? null : videos[0];

        } catch (Exception e) {
            throw new KCEDUException('비디오를 찾을 수 없습니다: ' + e.getMessage());
        }
    }
    
    /**
     * 학습 진도율 업데이트 - 영상 완료 시 전체 진도 동기화
     */
    @AuraEnabled
    public static Map<String, Object> updateLearningProgress(Id lessonId, Id sessionId) {
        try {
            Id currentUserId = UserInfo.getUserId();
            
            System.debug('=== updateLearningProgress 시작 ===');
            System.debug('lessonId: ' + lessonId + ', sessionId: ' + sessionId);

            // 1. LessonProgress 업데이트 또는 생성
            List<LessonProgress__c> existingLessonProgress = [
                SELECT Id, ProgressPercentage__c, Status__c
                FROM LessonProgress__c
                WHERE LessonId__c = :lessonId AND UserId__c = :currentUserId
                LIMIT 1
            ];

            LessonProgress__c lessonProgress;
            if (!existingLessonProgress.isEmpty()) {
                lessonProgress = existingLessonProgress[0];
            } else {
                lessonProgress = new LessonProgress__c(
                    LessonId__c = lessonId,
                    UserId__c = currentUserId,
                    ProgressPercentage__c = 0,
                    Status__c = 'NotStarted',
                    StartDate__c = System.today()
                );
            }

            // 2. 해당 Lesson의 모든 VideoProgress 조회하여 전체 진도율 계산
            List<VideoProgress__c> videoProgressList = [
                SELECT Id, ProgressPercentage__c, Completed__c
                FROM VideoProgress__c
                WHERE LessonProgress__c = :lessonProgress.Id
                AND User__c = :currentUserId
            ];

            if (videoProgressList.isEmpty()) {
                // VideoProgress가 없으면 0%로 시작 (비디오를 실제로 시청하지 않았음)
                lessonProgress.ProgressPercentage__c = 0;
                lessonProgress.Status__c = 'NotStarted';
                // CompletionDate는 설정하지 않음
            } else {
                // VideoProgress 기반으로 평균 진도율 계산
                Decimal totalProgress = 0;
                Integer completedVideos = 0;
                
                for (VideoProgress__c vp : videoProgressList) {
                    totalProgress += (vp.ProgressPercentage__c != null ? vp.ProgressPercentage__c : 0);
                    if (vp.Completed__c) {
                        completedVideos++;
                    }
                }
                
                Decimal avgProgress = totalProgress / videoProgressList.size();
                lessonProgress.ProgressPercentage__c = avgProgress;
                lessonProgress.Status__c = (avgProgress >= 100) ? 'Completed' : 'InProgress';
                
                if (avgProgress >= 100) {
                    lessonProgress.CompletionDate__c = System.today();
                }
            }

            upsert lessonProgress;

            // 3. CourseEnrollment 진도율 업데이트
            List<CourseEnrollment__c> enrollments = [
                SELECT Id, ProgressPercentage__c
                FROM CourseEnrollment__c
                WHERE CourseSessionId__c = :sessionId
                AND UserId__c = :currentUserId
                LIMIT 1
            ];

            if (!enrollments.isEmpty()) {
                CourseEnrollment__c enrollment = enrollments[0];
                
                // 해당 CourseSession의 모든 Subject(Lesson) 진도율 평균 계산
                // sessionId를 통해 해당 강의의 모든 Lesson을 조회하여 Subject를 찾음
                List<Lesson__c> allLessons = [
                    SELECT Id, SubjectId__c 
                    FROM Lesson__c 
                    WHERE SubjectId__c IN (
                        SELECT Id FROM Subject__c WHERE Status__c = 'Active'
                    )
                ];

                if (!allLessons.isEmpty()) {
                    Set<Id> lessonIds = new Set<Id>();
                    for (Lesson__c lesson : allLessons) {
                        lessonIds.add(lesson.Id);
                    }

                    List<LessonProgress__c> allLessonProgress = [
                        SELECT Id, ProgressPercentage__c
                        FROM LessonProgress__c
                        WHERE LessonId__c IN :lessonIds
                        AND UserId__c = :currentUserId
                    ];

                    if (!allLessonProgress.isEmpty()) {
                        Decimal totalCourseProgress = 0;
                        for (LessonProgress__c lp : allLessonProgress) {
                            totalCourseProgress += (lp.ProgressPercentage__c != null ? lp.ProgressPercentage__c : 0);
                        }
                        
                        Decimal avgCourseProgress = totalCourseProgress / allLessons.size();
                        enrollment.ProgressPercentage__c = avgCourseProgress;
                        
                        if (avgCourseProgress >= 100) {
                            enrollment.Status__c = 'Completed';
                            enrollment.CompletionDate__c = System.today();
                        } else if (avgCourseProgress > 0) {
                            enrollment.Status__c = 'In Progress';
                        }
                        
                        update enrollment;
                    }
                }
            }

            // 4. 결과 반환
            Map<String, Object> result = new Map<String, Object>();
            result.put('success', true);
            result.put('lessonProgress', lessonProgress.ProgressPercentage__c);
            result.put('lessonCompleted', lessonProgress.Status__c == 'Completed');
            result.put('message', '학습 진도가 업데이트되었습니다.');

            System.debug('✅ 진도율 업데이트 완료: ' + result);
            return result;

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, '❌ updateLearningProgress 오류: ' + e.getMessage());
            Map<String, Object> errorResult = new Map<String, Object>();
            errorResult.put('success', false);
            errorResult.put('message', '진도율 업데이트 실패: ' + e.getMessage());
            return errorResult;
        }
    }

    /**
     * 잘못된 진도율 데이터 초기화 - 관리자용 메서드
     */
    @AuraEnabled
    public static Map<String, Object> resetIncorrectProgress() {
        try {
            Id currentUserId = UserInfo.getUserId();
            
            System.debug('=== 잘못된 진도율 초기화 시작 ===');
            System.debug('currentUserId: ' + currentUserId);

            // 1. VideoProgress가 없는데 진도율이 있는 LessonProgress 조회
            List<LessonProgress__c> incorrectProgress = [
                SELECT Id, LessonId__c, ProgressPercentage__c, Status__c
                FROM LessonProgress__c
                WHERE UserId__c = :currentUserId
                AND ProgressPercentage__c > 0
                AND Id NOT IN (
                    SELECT LessonProgress__c 
                    FROM VideoProgress__c 
                    WHERE User__c = :currentUserId
                    AND ProgressPercentage__c > 0
                )
            ];

            System.debug('발견된 잘못된 진도율 레코드: ' + incorrectProgress.size());

            if (!incorrectProgress.isEmpty()) {
                // 2. 잘못된 진도율을 0%로 초기화
                for (LessonProgress__c lp : incorrectProgress) {
                    lp.ProgressPercentage__c = 0;
                    lp.Status__c = 'NotStarted';
                    lp.CompletionDate__c = null;
                }

                update incorrectProgress;

                System.debug('✅ 잘못된 진도율 초기화 완료');

                return new Map<String, Object>{
                    'success' => true,
                    'message' => '잘못된 진도율이 초기화되었습니다.',
                    'resetCount' => incorrectProgress.size()
                };
            } else {
                return new Map<String, Object>{
                    'success' => true,
                    'message' => '초기화할 잘못된 진도율이 없습니다.',
                    'resetCount' => 0
                };
            }

        } catch (Exception e) {
            System.debug('❌ 진도율 초기화 오류: ' + e.getMessage());
            return new Map<String, Object>{
                'success' => false,
                'message' => e.getMessage(),
                'resetCount' => 0
            };
        }
    }

    /**
     * 내 수강 목록 간단 조회 - EduController.getMyCoursesSimple() 패턴 매칭
     */
    @AuraEnabled
    public static List<CourseEnrollment__c> getMyCoursesSimple() {
        try {
            Id currentUserId = UserInfo.getUserId();

            // 수강신청 데이터 조회 - UserId 기반으로 조회
            List<CourseEnrollment__c> enrollments = [
                    SELECT Id,
                            Status__c,
                            EnrollmentDate__c,
                            CourseSessionId__c,
                            CourseSessionId__r.Id,
                            CourseSessionId__r.Name,
                            CourseSessionId__r.CourseId__c,
                            CourseSessionId__r.CourseId__r.Id,
                            CourseSessionId__r.CourseId__r.Name,
                            CourseSessionId__r.CourseId__r.Description__c,
                            CourseSessionId__r.CourseId__r.ThumbnailURL__c,
                            CourseSessionId__r.CourseId__r.Category__c,
                            CourseSessionId__r.CourseId__r.Level__c,
                            CourseSessionId__r.CourseId__r.Status__c
                    FROM CourseEnrollment__c
                    WHERE UserId__c = :currentUserId
                    AND Status__c IN ('Approved', 'In Progress', 'Completed')
                    ORDER BY EnrollmentDate__c DESC
            ];

            return enrollments;

        } catch (Exception e) {
            System.debug('수강 목록 조회 오류: ' + e.getMessage());
            System.debug('스택 트레이스: ' + e.getStackTraceString());
            throw new KCEDUException(e.getMessage());
        }
    }

    /**
     * 강의 목록 조회 - EduController.getCourses() 패턴 매칭
     */
    @AuraEnabled
    public static CourseListResult getCourses(String searchTerm, String category, Integer pageNumber, Integer pageSize) {
        try {
            if (pageNumber == null) pageNumber = 1;
            if (pageSize == null) pageSize = 10;

            String query = 'SELECT Id, Name, Description__c, Category__c, Level__c, DurationHours__c, Price__c, Status__c, ThumbnailURL__c FROM Course__c WHERE Status__c = \'Active\'';
            List<String> conditions = new List<String>();

            if (String.isNotBlank(searchTerm)) {
                conditions.add('(Name LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\' OR Description__c LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\')');
            }

            if (String.isNotBlank(category)) {
                conditions.add('Category__c = \'' + String.escapeSingleQuotes(category) + '\'');
            }

            if (!conditions.isEmpty()) {
                query += ' AND ' + String.join(conditions, ' AND ');
            }

            query += ' ORDER BY CreatedDate DESC LIMIT ' + pageSize + ' OFFSET ' + ((pageNumber - 1) * pageSize);

            List<Course__c> courses = Database.query(query);
            return new CourseListResult(true, '조회 성공', courses);

        } catch (Exception e) {
            throw new KCEDUException(e.getMessage());
        }
    }
    
    // ==================================================================================
    // 📦 WRAPPER 클래스들 - EduController와 완전 동일
    // ==================================================================================

    /**
     * 대시보드 전체 데이터 Wrapper
     */
   public virtual class DashboardDataWrapper {
    @AuraEnabled public Boolean success { get; set; }
    @AuraEnabled public String message { get; set; }
    @AuraEnabled public UserProfileWrapper userProfile { get; set; }
    @AuraEnabled public List<CourseEnrollmentWrapper> myCourses { get; set; }
    @AuraEnabled public List<SubjectEnrollmentWrapper> mySubjects { get; set; } // ⭐ 추가
    @AuraEnabled public List<CourseSessionWrapper> recommendedCourseSessions { get; set; }
    @AuraEnabled public StatisticsWrapper statistics { get; set; }

    public DashboardDataWrapper() {
        this.success = false;
        this.message = '';
        this.userProfile = new UserProfileWrapper();
        this.myCourses = new List<CourseEnrollmentWrapper>();
        this.mySubjects = new List<SubjectEnrollmentWrapper>(); // ⭐ 추가
        this.recommendedCourseSessions = new List<CourseSessionWrapper>();
        this.statistics = new StatisticsWrapper();
    }
}

    /**
     * 사용자 프로필 Wrapper
     */
    public virtual class UserProfileWrapper {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String username { get; set; }
        @AuraEnabled public String email { get; set; }
        @AuraEnabled public String displayName { get; set; }

        public UserProfileWrapper() {
            // 기본값 설정
            this.id = '';
            this.name = '사용자';
            this.username = '';
            this.email = '';
            this.displayName = '사용자';
        }

        public UserProfileWrapper(User user) {
            // 먼저 기본값 설정
            this.id = '';
            this.name = '사용자';
            this.username = '';
            this.email = '';
            this.displayName = '사용자';

            if (user != null) {
                this.id = user.Id != null ? user.Id : '';
                this.name = String.isNotBlank(user.Name) ? user.Name : '사용자';
                this.username = String.isNotBlank(user.Username) ? user.Username : '';
                this.email = String.isNotBlank(user.Email) ? user.Email : '';

                // displayName 우선순위: Name > Username(@ 앞부분) > '사용자'
                if (String.isNotBlank(user.Name)) {
                    this.displayName = user.Name;
                } else if (String.isNotBlank(user.Username)) {
                    this.displayName = user.Username.contains('@') ? user.Username.split('@')[0] : user.Username;
                } else {
                    this.displayName = '사용자';
                }
            }

            System.debug('👤 UserProfileWrapper 생성 완료: ' + this.displayName + ' (ID: ' + this.id + ')');
        }
    }

    /**
     * 수강신청 Wrapper
     */
    public virtual class CourseEnrollmentWrapper {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String sessionId { get; set; }
        @AuraEnabled public String courseId { get; set; } // 코스 ID 추가
        @AuraEnabled public String sessionName { get; set; }
        @AuraEnabled public String sessionDescription { get; set; }
        @AuraEnabled public String sessionThumbnail { get; set; }
        @AuraEnabled public String sessionCategory { get; set; }
        @AuraEnabled public String sessionLevel { get; set; }
        @AuraEnabled public Decimal progressPercentage { get; set; }
        @AuraEnabled public String statusText { get; set; }
        @AuraEnabled public String statusClass { get; set; }
        @AuraEnabled public String enrollmentStatus { get; set; }
        @AuraEnabled public Date enrollmentDate { get; set; }
        @AuraEnabled public Boolean isCompleted { get; set; }
        @AuraEnabled public Boolean isInProgress { get; set; }
        @AuraEnabled public String instructor {get; set;}

        public CourseEnrollmentWrapper() {
        }

        public CourseEnrollmentWrapper(CourseEnrollment__c enrollment, Decimal progressPercentage) {
            if (enrollment != null) {
                this.id = enrollment.Id;
                this.progressPercentage = progressPercentage;
                this.enrollmentStatus = enrollment.Status__c;
                this.enrollmentDate = enrollment.EnrollmentDate__c != null ?
                        enrollment.EnrollmentDate__c.date() : null;

                // 강의 정보 추출
                if (enrollment.CourseSessionId__r != null) {
                    CourseSession__c session = enrollment.CourseSessionId__r;

                    this.sessionId = session.Id;
                    this.sessionName = session.Name;
                    this.sessionDescription = session.Description__c;
                    this.courseId = session.CourseId__c; // 코스 ID 설정
                    this.sessionThumbnail = session.CourseId__r.ThumbnailURL__c;
                    this.sessionCategory = session.CourseId__r.Category__c;
                    this.sessionLevel = session.CourseId__r.Level__c;

                    // 강사 정보 설정 - 기본값으로 강사명을 설정하고, 실제 강사 조회는 별도 로직에서 처리
                    this.instructor = '강사 정보 로딩중...';

                    // 상태 정보 계산
                    this.isCompleted = this.progressPercentage >= 100;
                    this.isInProgress = this.progressPercentage > 0 && this.progressPercentage < 100;
                    
                    this.statusText = this.isCompleted ? '완료' : (this.isInProgress ? '진행중' : '미시작');
                    this.statusClass = this.isCompleted ? 'status-completed' :
                            (this.isInProgress ? 'status-progress' : 'status-pending');
                }
            }
        }
    }

    /**
     * 강의 세션 Wrapper - 추천 강의용
     */
    public virtual class CourseSessionWrapper {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public String thumbnail { get; set; }
        @AuraEnabled public String category { get; set; }
        @AuraEnabled public String level { get; set; }
        @AuraEnabled public String instructor { get; set; } // 강사 정보 추가
        @AuraEnabled public Decimal price { get; set; }
        @AuraEnabled public Decimal duration { get; set; }
        @AuraEnabled public String status { get; set; }
        @AuraEnabled public String displayPrice { get; set; }
        @AuraEnabled public String displayDuration { get; set; }
    
        public CourseSessionWrapper() {
        }

        public CourseSessionWrapper(CourseSession__c session) {
            if (session != null) {
                this.id = session.Id;
                this.name = session.Name;
                this.description = session.Description__c;
                this.thumbnail = session.CourseId__r.ThumbnailURL__c;
                this.category = session.CourseId__r.Category__c;
                this.level = session.CourseId__r.Level__c;
                this.price = session.Price__c;
                this.duration = session.CourseId__r.DurationHours__c;
                this.status = session.Status__c;

                // 강사 정보 기본값 설정 (실제 조회는 별도 처리)
                this.instructor = '강사 정보 없음';

                // 표시용 필드들
                this.displayPrice = this.price != null ?
                        String.valueOf(this.price.intValue()) + '원' : '무료';
                this.displayDuration = this.duration != null ?
                        String.valueOf(this.duration.intValue()) + '시간' : '';
            }
        }
    }

    /**
     * 통계 Wrapper
     */
    public virtual class StatisticsWrapper {
        @AuraEnabled public Integer completedCourses { get; set; }
        @AuraEnabled public Integer inProgressCourses { get; set; }
        @AuraEnabled public Integer totalEnrollments { get; set; }
        @AuraEnabled public Integer myPoints { get; set; }
        @AuraEnabled public Decimal completionRate { get; set; }

        public StatisticsWrapper() {
            this.completedCourses = 0;
            this.inProgressCourses = 0;
            this.totalEnrollments = 0;
            this.myPoints = 0;
            this.completionRate = 0;
        }

        public StatisticsWrapper(Integer completed, Integer inProgress, Integer total, Integer points) {
            this.completedCourses = completed;
            this.inProgressCourses = inProgress;
            this.totalEnrollments = total;
            this.myPoints = points;
            this.completionRate = total > 0 ? (completed * 100.0 / total) : 0;
        }
    }

    // ========== Result 클래스들 ==========

    public class CourseSessionListResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public List<CourseSession__c> sessions;

        public CourseSessionListResult(Boolean success, String message, List<CourseSession__c> sessions) {
            this.success = success;
            this.message = message;
            this.sessions = sessions;
        }
    }

    public class CourseListResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public List<Course__c> courses;

        public CourseListResult(Boolean success, String message, List<Course__c> courses) {
            this.success = success;
            this.message = message;
            this.courses = courses;
        }
    }

    public class EnrollmentResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public CourseEnrollment__c enrollment;

        public EnrollmentResult(Boolean success, String message, CourseEnrollment__c enrollment) {
            this.success = success;
            this.message = message;
            this.enrollment = enrollment;
        }
    }
    /**
     * 현재 사용자 프로필 조회 - EduController 패턴 매칭
     */
    @AuraEnabled
    public static User getCurrentUserProfile() {
        try {
            Id currentUserId = UserInfo.getUserId();
            return [
                SELECT Id, Username, Name, Email, Phone, CreatedDate
                FROM User
                WHERE Id = :currentUserId
                LIMIT 1
            ];
        } catch (Exception e) {
            throw new KCEDUException('사용자 정보를 찾을 수 없습니다: ' + e.getMessage());
        }
    }

    /**
     * 강의 세션 상세 조회 - EduController 패턴 매칭
     */
    @AuraEnabled
    public static CourseSession__c getCourseSessionDetail(Id courseSessionId) {
        try {
            return [
                SELECT Id, Name, Description__c, CourseId__c, CourseId__r.Subtitle__c, CourseId__r.Name, CourseId__r.Category__c,
                       CourseId__r.ThumbnailURL__c, CourseId__r.Level__c, CourseId__r.DurationHours__c,
                       StartDate__c, EndDate__c, Status__c, MaxCapacity__c, CurrentEnrollment__c, Price__c,
                       RegistrationStart__c, RegistrationEnd__c
                FROM CourseSession__c
                WHERE Id = :courseSessionId AND Status__c IN ('Recruiting', 'In Progress', 'Completed')
                LIMIT 1
            ];
        } catch (Exception e) {
            throw new KCEDUException('강의 세션을 찾을 수 없습니다: ' + e.getMessage());
        }

  }

    /**
     * 강의에 포함된 과목 목록 조회 - EduController 패턴 매칭
     */
    @AuraEnabled
    public static List<Map<String, Object>> getCourseSubjects(Id sessionId) {
        try {
            CourseSession__c session = [
                SELECT CourseId__c
                FROM CourseSession__c
                WHERE Id = :sessionId
                LIMIT 1
            ];

            List<CourseSubject__c> subjects = [
                SELECT Id, SubjectId__c, SubjectId__r.Name, SubjectId__r.Description__c,
                       SubjectId__r.DurationHours__c, SubjectId__r.Level__c,
                       Sequence__c, IsRequired__c
                FROM CourseSubject__c
                WHERE CourseId__c = :session.CourseId__c
                AND SubjectId__r.Status__c = 'Active'
                ORDER BY Sequence__c
            ];

            List<Map<String, Object>> result = new List<Map<String, Object>>();
            Id userId = UserInfo.getUserId();

            // Collect all subject IDs
            Set<Id> subjectIds = new Set<Id>();
            for (CourseSubject__c cs : subjects) {
                subjectIds.add(cs.SubjectId__c);
            }

            if (subjectIds.isEmpty()) {
                return result;
            }

            for (CourseSubject__c cs : subjects) {
                Map<String, Object> subjectMap = new Map<String, Object>();
                subjectMap.put('Id', cs.SubjectId__c);
                subjectMap.put('Name', cs.SubjectId__r.Name);
                subjectMap.put('Description', cs.SubjectId__r.Description__c);
                subjectMap.put('DurationHours', cs.SubjectId__r.DurationHours__c);
                subjectMap.put('Level', cs.SubjectId__r.Level__c);
                subjectMap.put('Sequence', cs.Sequence__c);
                subjectMap.put('IsRequired', cs.IsRequired__c);
                subjectMap.put('enrolled', false); // 기본값
                subjectMap.put('progress', 0); // 기본값
                subjectMap.put('isCompleted', false); // 기본값
                result.add(subjectMap);
            }

            return result;

        } catch (Exception e) {
            throw new KCEDUException('강의 과목을 찾을 수 없습니다: ' + e.getMessage());
        }
    }

    /**
     * 과목 상세 정보 조회 - EduController 패턴 매칭
     */
    @AuraEnabled
    public static Subject__c getSubjectDetail(Id subjectId) {
        try {
            System.debug('=== getSubjectDetail 호출 ===');
            System.debug('전달받은 subjectId: ' + subjectId);

            return [
                SELECT Id, Name, Description__c, LearningObjectives__c,
                       DurationHours__c, Level__c, Status__c, SubjectType__c
                FROM Subject__c
                WHERE Id = :subjectId
                LIMIT 1
            ];
        } catch (Exception e) {
            System.debug('getSubjectDetail 오류: ' + e.getMessage());
            System.debug('스택 트레이스: ' + e.getStackTraceString());
            throw new KCEDUException('과목을 찾을 수 없습니다: ' + e.getMessage());
        }
    }

    /**
     * 과목의 레슨 목록 조회 - EduController 패턴 매칭
     */
    @AuraEnabled
    public static List<Map<String, Object>> getSubjectLessons(Id subjectId) {
        try {
            Id currentUserId = UserInfo.getUserId();

            List<Lesson__c> lessons = [
                SELECT Id, Name, Description__c, Sequence__c, DurationMinutes__c,
                       ContentType__c, IsRequired__c, LearningObjectives__c, 
                       (SELECT Id FROM Assignments__r)
                FROM Lesson__c
                WHERE SubjectId__c = :subjectId
                ORDER BY Sequence__c
            ];
            
            // Lesson ID들 수집
            Set<Id> lessonIds = new Set<Id>();
            for (Lesson__c lesson : lessons) {
                lessonIds.add(lesson.Id);
            }
            
            // ContentDocumentLink 조회하여 Lesson과 연결된 파일들 찾기
            Map<Id, Id> lessonToContentDocMap = new Map<Id, Id>();
            if (!lessonIds.isEmpty()) {
                List<ContentDocumentLink> cdLinks = [
                    SELECT LinkedEntityId, ContentDocumentId
                    FROM ContentDocumentLink
                    WHERE LinkedEntityId IN :lessonIds
                ];
                
                for (ContentDocumentLink cdl : cdLinks) {
                    lessonToContentDocMap.put(cdl.LinkedEntityId, cdl.ContentDocumentId);
                }
            }
            
            // ContentVersion 정보 조회 (ContentUrl 포함)
            Map<Id, ContentVersion> contentVersionMap = new Map<Id, ContentVersion>();
            if (!lessonToContentDocMap.isEmpty()) {
                List<ContentVersion> contentVersions = [
                    SELECT Id, ContentDocumentId, ContentUrl, Title, FileExtension, ContentSize
                    FROM ContentVersion
                    WHERE ContentDocumentId IN :lessonToContentDocMap.values()
                    AND IsLatest = true
                ];
                
                for (ContentVersion cv : contentVersions) {
                    contentVersionMap.put(cv.ContentDocumentId, cv);
                }
            }


            // Get all assignment IDs for these lessons
            Set<Id> allAssignmentIds = new Set<Id>();
            for (Lesson__c lesson : lessons) {
                for (Assignment__c assignment : lesson.Assignments__r) {
                    allAssignmentIds.add(assignment.Id);
                }
            }

            Set<Id> submittedAssignmentIds = new Set<Id>();
            if (!allAssignmentIds.isEmpty()) {
                List<AssignmentSubmission__c> submissions = [
                    SELECT AssignmentId__c
                    FROM AssignmentSubmission__c
                    WHERE AssignmentId__c IN :allAssignmentIds
                    AND UserId__c = :currentUserId
                ];

                for (AssignmentSubmission__c submission : submissions) {
                    submittedAssignmentIds.add(submission.AssignmentId__c);
                }
            }

            List<Map<String, Object>> result = new List<Map<String, Object>>();

            for (Lesson__c lesson : lessons) {
                Map<String, Object> lessonMap = new Map<String, Object>();
                lessonMap.put('Id', lesson.Id);
                lessonMap.put('Name', lesson.Name);
                lessonMap.put('Description', lesson.Description__c);
                lessonMap.put('Sequence', lesson.Sequence__c);
                lessonMap.put('DurationMinutes', lesson.DurationMinutes__c);
                lessonMap.put('ContentType', lesson.ContentType__c);
                lessonMap.put('IsRequired', lesson.IsRequired__c);
                lessonMap.put('LearningObjectives', lesson.LearningObjectives__c);

                // ContentVersion URL 정보 추가
                Id contentDocId = lessonToContentDocMap.get(lesson.Id);
                if (contentDocId != null) {
                    ContentVersion cv = contentVersionMap.get(contentDocId);
                    if (cv != null) {
                        lessonMap.put('ContentUrl', cv.ContentUrl);
                        lessonMap.put('FileName', cv.Title);
                        lessonMap.put('FileExtension', cv.FileExtension);
                        lessonMap.put('FileSize', cv.ContentSize);
                    }
                }

                // Calculate assignment completion
                Integer totalAssignments = lesson.Assignments__r.size();
                Integer completedAssignments = 0;

                for (Assignment__c assignment : lesson.Assignments__r) {
                    if (submittedAssignmentIds.contains(assignment.Id)) {
                        completedAssignments++;
                    }
                }

                lessonMap.put('totalAssignments', totalAssignments);
                lessonMap.put('completedAssignments', completedAssignments);
                lessonMap.put('assignmentProgress', totalAssignments > 0 ? (completedAssignments * 100 / totalAssignments) : 0);

                result.add(lessonMap);
            }

            return result;

        } catch (Exception e) {
            throw new KCEDUException('레슨 목록을 조회할 수 없습니다: ' + e.getMessage());
        }
    }

    /**
     * 과목의 학습 상태 조회 - EduController 패턴 매칭
     */
    @AuraEnabled
    public static Map<String, Object> getSubjectLearningStatus(Id subjectId) {
        try {
            Id currentUserId = UserInfo.getUserId();
            Map<String, Object> result = new Map<String, Object>();

            System.debug('=== getSubjectLearningStatus 시작 ===');
            System.debug('currentUserId: ' + currentUserId);
            System.debug('subjectId: ' + subjectId);

            // 기본 상태 설정
            result.put('enrolled', false);
            result.put('progress', 0);
            result.put('isCompleted', false);
            result.put('startDate', null);
            result.put('completionDate', null);

            System.debug('기본 결과 설정 완료: ' + JSON.serialize(result));
            System.debug('최종 반환 결과: ' + JSON.serialize(result));
            return result;

        } catch (Exception e) {
            System.debug('getSubjectLearningStatus 오류: ' + e.getMessage());
            System.debug('오류 스택: ' + e.getStackTraceString());

            Map<String, Object> errorResult = new Map<String, Object>();
            errorResult.put('enrolled', false);
            errorResult.put('progress', 0);
            errorResult.put('isCompleted', false);
            errorResult.put('error', e.getMessage());
            return errorResult;
        }
    }

    /**
     * 강의 상세 정보 조회 (lessonPlayer용)
     */
    @AuraEnabled(cacheable=true)
    public static LessonDetailWrapper getLessonDetail(Id lessonId) {
        try {
            System.debug('=== getLessonDetail 시작 ===');
            System.debug('lessonId: ' + lessonId);

            // Subject 정보 조회
            Subject__c subject = [
                SELECT Id, Name, Description__c, DurationHours__c, Level__c
                FROM Subject__c
                WHERE Id = :lessonId
                LIMIT 1
            ];

            // Lesson 관련 추가 정보들 조회 (필요시)
            List<Lesson__c> lessons = [
                SELECT Id, Name, Description__c, DurationMinutes__c,
                       IsRequired__c
                FROM Lesson__c
                WHERE SubjectId__c = :lessonId
                ORDER BY Id ASC
            ];

            // LessonDetailWrapper 생성
            LessonDetailWrapper wrapper = new LessonDetailWrapper();
            wrapper.success = true;
            wrapper.message = '강의 정보 조회 성공';
            wrapper.subject = subject;
            wrapper.lessons = lessons;
            wrapper.totalLessons = lessons.size();
            wrapper.totalDuration = calculateTotalDuration(lessons);

            System.debug('✅ getLessonDetail 완료');
            return wrapper;

        } catch (Exception e) {
            System.debug('❌ getLessonDetail 오류: ' + e.getMessage());
            LessonDetailWrapper errorWrapper = new LessonDetailWrapper();
            errorWrapper.success = false;
            errorWrapper.message = '강의 정보를 불러올 수 없습니다: ' + e.getMessage();
            return errorWrapper;
        }
    }

    /**
     * 강의 총 시간 계산
     */
    private static Integer calculateTotalDuration(List<Lesson__c> lessons) {
        Integer totalMinutes = 0;
        for (Lesson__c lesson : lessons) {
            if (lesson.DurationMinutes__c != null) {
                totalMinutes += lesson.DurationMinutes__c.intValue();
            }
        }
        return totalMinutes;
    }

    /**
     * 수강신청의 실제 진행도 계산 (LessonProgress 기반)
     */
    private static Decimal calculateEnrollmentProgress(Id enrollmentId, Id userId) {
        try {
            // 해당 수강신청의 CourseSession 조회
            List<CourseEnrollment__c> enrollments = [
                SELECT CourseSessionId__c, CourseSessionId__r.CourseId__c
                FROM CourseEnrollment__c
                WHERE Id = :enrollmentId
                LIMIT 1
            ];
            
            if (enrollments.isEmpty()) {
                return 0;
            }
            
            Id sessionId = enrollments[0].CourseSessionId__c;
            Id courseId = enrollments[0].CourseSessionId__r.CourseId__c;
            
            // Course의 모든 Subject 조회
            List<CourseSubject__c> courseSubjects = [
                SELECT SubjectId__c
                FROM CourseSubject__c
                WHERE CourseId__c = :courseId
            ];
            
            if (courseSubjects.isEmpty()) {
                return 0;
            }
            
            Set<Id> subjectIds = new Set<Id>();
            for (CourseSubject__c cs : courseSubjects) {
                subjectIds.add(cs.SubjectId__c);
            }
            
            // Subject들의 모든 Lesson 조회
            List<Lesson__c> lessons = [
                SELECT Id
                FROM Lesson__c
                WHERE SubjectId__c IN :subjectIds
            ];
            
            if (lessons.isEmpty()) {
                return 0;
            }
            
            Set<Id> lessonIds = new Set<Id>();
            for (Lesson__c lesson : lessons) {
                lessonIds.add(lesson.Id);
            }
            
            // 사용자의 LessonProgress 조회
            List<LessonProgress__c> progressList = [
                SELECT ProgressPercentage__c
                FROM LessonProgress__c
                WHERE LessonId__c IN :lessonIds
                AND UserId__c = :userId
                AND ProgressPercentage__c > 0
            ];
            
            // 진행도 계산: 완료한 레슨 수 / 전체 레슨 수
            if (progressList.isEmpty()) {
                return 0;
            }
            
            // 100% 완료한 레슨 수 계산
            Integer completedLessons = 0;
            for (LessonProgress__c progress : progressList) {
                if (progress.ProgressPercentage__c >= 100) {
                    completedLessons++;
                }
            }
            
            // 전체 진행도 = (완료한 레슨 수 / 전체 레슨 수) * 100
            Decimal totalProgress = (Decimal.valueOf(completedLessons) / Decimal.valueOf(lessons.size())) * 100;
            
            return totalProgress.setScale(0); // 소수점 제거
            
        } catch (Exception e) {
            System.debug('진행도 계산 오류: ' + e.getMessage());
            return 0;
        }
    }

    // ========== Exception 클래스 ==========
    public class KCEDUException extends Exception {}

    // ========== Wrapper 클래스들 ==========
    public class LessonDetailWrapper {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public Subject__c subject;
        @AuraEnabled public List<Lesson__c> lessons;
        @AuraEnabled public Integer totalLessons;
        @AuraEnabled public Integer totalDuration; // 총 시간 (분)
    }
}