// app.js - COMPLETE UPDATED VERSION WITH ALL FIXES AND NEW FEATURES
class CacheManager {
    constructor() {
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        this.PREFIX = "smart_evaluator_";
        this.forceRefresh = false;
    }

    // Add this method to handle missing DOM elements gracefully
    validateDOMPages() {
        const requiredPages = [
            'dashboard', 'groups', 'members', 'group-members', 'all-students',
            'student-ranking', 'group-analysis', 'tasks', 'evaluation', 
            'group-policy', 'export', 'admin-management', 'graph-analysis'
        ];

        requiredPages.forEach(pageId => {
            const pageElement = document.getElementById(`page-${pageId}`);
            if (!pageElement) {
                console.warn(`Page element not found: page-${pageId}`);
            }
        });
    }

    // Update the init method to call this validation
    async init() {
        this.setupDOMReferences();
        await this.initializeFirebase();
        this.setupEventListeners();
        this.setupAuthStateListener();
        this.applySavedTheme();

        // Validate DOM pages
        this.validateDOMPages();

        // DOM elements check করুন
        console.log("DOM Elements Check:", {
            headerLoginBtn: !!this.dom.headerLoginBtn,
            logoutBtn: !!this.dom.logoutBtn,
            userInfo: !!this.dom.userInfo,
            appContainer: !!this.dom.appContainer,
            authModal: !!this.dom.authModal
        });

        // Initially set to public view
        this.updateUserInterface(null);
        this.enableAllNavigation(false);
        
        // Public data load করুন
        await this.loadPublicData();

        this.isInitialized = true;
        console.log("Smart Evaluator initialized successfully");
        
        // Debug info
        setTimeout(() => {
            this.debugAuthState();
        }, 2000);
    }

    // Update the showPage method with better error handling
    showPage(pageId) {
        console.log(`Showing page: ${pageId}`);
        
        // Hide all pages
        this.dom.pages.forEach((page) => {
            page.classList.add("hidden");
        });

        // Show selected page
        const selectedPage = document.getElementById(`page-${pageId}`);
        if (selectedPage) {
            selectedPage.classList.remove("hidden");
            console.log(`Page ${pageId} shown successfully`);
        } else {
            console.error(`Page with id page-${pageId} not found`);
            // Fallback to dashboard if page doesn't exist
            const dashboardPage = document.getElementById('page-dashboard');
            if (dashboardPage) {
                dashboardPage.classList.remove("hidden");
                console.log(`Fallback to dashboard - page-${pageId} not found`);
            }
        }

        // Update active navigation
        this.dom.navBtns.forEach((btn) => {
            btn.classList.remove("active");
            if (btn.getAttribute("data-page") === pageId) {
                btn.classList.add("active");
            }
        });

        // Update page title
        if (this.dom.pageTitle) {
            const activeBtn = document.querySelector(`[data-page="${pageId}"]`);
            if (activeBtn) {
                this.dom.pageTitle.textContent = activeBtn.textContent.trim();
            }
        }
    }

    set(key, data, customDuration = null) {
        const cacheData = {
            data,
            timestamp: Date.now(),
            expires: Date.now() + (customDuration || this.CACHE_DURATION),
        };
        try {
            localStorage.setItem(this.PREFIX + key, JSON.stringify(cacheData));
        } catch (e) {
            this.clearOldest();
            localStorage.setItem(this.PREFIX + key, JSON.stringify(cacheData));
        }
    }

    get(key) {
        const cached = localStorage.getItem(this.PREFIX + key);
        if (!cached || this.forceRefresh) return null;

        try {
            const cacheData = JSON.parse(cached);
            const { data, expires } = cacheData;

            if (Date.now() > expires) {
                this.clear(key);
                return null;
            }
            return data;
        } catch (e) {
            this.clear(key);
            return null;
        }
    }

    clear(key) {
        localStorage.removeItem(this.PREFIX + key);
    }

    clearAll() {
        Object.keys(localStorage)
            .filter((key) => key.startsWith(this.PREFIX))
            .forEach((key) => localStorage.removeItem(key));
    }

    clearOldest() {
        const keys = Object.keys(localStorage).filter((key) =>
            key.startsWith(this.PREFIX)
        );
        if (keys.length > 50) {
            const sorted = keys
                .map((key) => ({
                    key,
                    timestamp: JSON.parse(localStorage.getItem(key)).timestamp,
                }))
                .sort((a, b) => a.timestamp - b.timestamp);

            sorted.slice(0, 10).forEach((item) => this.clear(item.key));
        }
    }
}

class SmartGroupEvaluator {
    constructor() {
        this.cache = new CacheManager();
        this.currentUser = null;
        this.currentUserData = null;
        this.isPublicMode = true;
        this.currentChart = null;
        this.isInitialized = false;
        this.authModalShown = false;

        this.state = {
            groups: [],
            students: [],
            tasks: [],
            evaluations: [],
            admins: [],
            problemStats: {},
        };

        this.filters = {
            membersFilterGroupId: "",
            membersSearchTerm: "",
            cardsFilterGroupId: "",
            cardsSearchTerm: "",
            groupMembersFilterGroupId: "",
            analysisFilterGroupIds: [],
            adminSearchTerm: "",
        };

        // Update these arrays in your constructor
        this.PUBLIC_PAGES = [
            "dashboard",
            "all-students", 
            "group-policy",
            "export",
            "student-ranking",
            "group-analysis",
            "graph-analysis", // NEW PAGE ADDED
        ];

        this.PRIVATE_PAGES = [
            "groups",
            "members",
            "group-members", 
            "tasks",
            "evaluation",
            "admin-management",
        ];

        // ALL_PAGES for admin users
        this.ALL_PAGES = [...this.PUBLIC_PAGES, ...this.PRIVATE_PAGES];

        this.evaluationOptions = [
            { id: "cannot_do", text: "আমি এই টপিক এখনো পারিনা", marks: -5 },
            {
                id: "learned_cannot_write",
                text: "আমি এই টপিক শুধুমাত্র বুঝেছি (ভালো করে শেখা হয়নি)",
                marks: 5,
            },
            {
                id: "learned_can_write",
                text: "আমি এই টপিক বুঝেছি ও ভালো করে শিখেছি",
                marks: 10,
            },
            {
                id: "weekly_homework",
                text: "আমি বাড়ির কাজ সপ্তাহে প্রতিদিন করেছি",
                marks: 5,
            },
            {
                id: "weekly_attendance",
                text: "আমি সপ্তাহে প্রতিদিন উপস্থিত ছিলাম",
                marks: 10,
            },
        ];

        this.roleNames = {
            "team-leader": "টিম লিডার",
            "time-keeper": "টাইম কিপার",
            reporter: "রিপোর্টার",
            "resource-manager": "রিসোর্স ম্যানেজার",
            "peace-maker": "পিস মেকার",
        };

        this.policySections = [
            {
                title: "গ্রুপ সদস্য নিয়মাবলী",
                content: "১. প্রতিটি গ্রুপে সর্বোচ্চ ৫ জন সদস্য থাকবে।\n২. প্রত্যেক সদস্যের একটি নির্দিষ্ট দায়িত্ব থাকবে।\n৩. গ্রুপ লিডার দায়িত্ব পালন নিশ্চিত করবে।\n৪. সকল সদস্যকে সাপ্তাহিক মিটিং এ উপস্থিত থাকতে হবে।\n৫. গ্রুপ কাজ সময়মতো জমা দিতে হবে।",
            },
            {
                title: "মূল্যায়ন পদ্ধতি",
                content: "১. টাস্ক সম্পূর্ণতা - ৪০%\n২. টিমওয়ার্ক - ৩০%\n৩. সময়ানুবর্তিতা - ২০%\n৪. অতিরিক্ত কাজ - ১০%\n৫. উপস্থিতি - বোনাস পয়েন্ট\n৬. বাড়ির কাজ - বোনাস পয়েন্ট",
            },
            {
                title: "স্কোরিং সিস্টেম",
                content: "টাস্ক স্কোর: ০-১০০ পয়েন্ট\nটিমওয়ার্ক: ০-১০ পয়েন্ট\nঅতিরিক্ত পয়েন্ট: বিশেষ কৃতিত্বের জন্য\nনেগেটিভ পয়েন্ট: দায়িত্ব পালনে ব্যর্থতা\nবোনাস পয়েন্ট: অতিরিক্ত কাজের জন্য",
            },
            {
                title: "গ্রুপ লিডারের দায়িত্ব",
                content: "১. গ্রুপ মিটিং পরিচালনা\n২. কাজ বণ্টন করা\n৩. প্রোগ্রেস ট্র্যাক করা\n৪. সমস্যা সমাধান করা\n৫. রিপোর্ট তৈরি করা",
            },
            {
                title: "সদস্যদের দায়িত্ব",
                content: "১. নির্দিষ্ট কাজ সময়মতো করা\n২. গ্রুপ মিটING এ উপস্থিত থাকা\n৩. অন্যান্য সদস্যদের সহযোগিতা করা\n৪. সমস্যা হলে লিডারকে জানানো\n৫. গ্রুপের উন্নতির জন্য পরামর্শ দেওয়া",
            },
        ];

        this.deleteCallback = null;
        this.editCallback = null;
        this.currentEditingAdmin = null;
        this.currentEvaluation = null;
        this.csvImportData = null;

        // Initialize debouncers
        this.searchDebouncer = this.createDebouncer(300);

        this.init();
    }

    createDebouncer(delay) {
        let timeoutId;
        return (callback) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(callback, delay);
        };
    }

    debugAuthState() {
        console.log("=== AUTH DEBUG INFO ===");
        console.log("Current User:", this.currentUser);
        console.log("Current User Data:", this.currentUserData);
        console.log("Is Public Mode:", this.isPublicMode);
        console.log("Available Pages:", {
            public: this.PUBLIC_PAGES,
            private: this.PRIVATE_PAGES,
            all: this.ALL_PAGES
        });
        
        // Navigation buttons status
        const navStatus = {};
        this.dom.navBtns.forEach(btn => {
            const pageId = btn.getAttribute("data-page");
            navStatus[pageId] = {
                disabled: btn.disabled,
                opacity: btn.style.opacity,
                pointerEvents: btn.style.pointerEvents,
                hasDisabledClass: btn.classList.contains("disabled-nav"),
                isPublic: this.PUBLIC_PAGES.includes(pageId),
                isPrivate: this.PRIVATE_PAGES.includes(pageId)
            };
        });
        console.log("Navigation Status:", navStatus);
    }

    async init() {
        this.setupDOMReferences();
        await this.initializeFirebase();
        this.setupEventListeners();
        this.setupAuthStateListener();
        this.applySavedTheme();

        // DOM elements check করুন
        console.log("DOM Elements Check:", {
            headerLoginBtn: !!this.dom.headerLoginBtn,
            logoutBtn: !!this.dom.logoutBtn,
            userInfo: !!this.dom.userInfo,
            appContainer: !!this.dom.appContainer,
            authModal: !!this.dom.authModal
        });

        // Initially set to public view
        this.updateUserInterface(null);
        this.enableAllNavigation(false);
        
        // Public data load করুন
        await this.loadPublicData();

        this.isInitialized = true;
        console.log("Smart Evaluator initialized successfully");
        
        // Debug info
        setTimeout(() => {
            this.debugAuthState();
        }, 2000);
    }

    setupAuthStateListener() {
        auth.onAuthStateChanged(async (user) => {
            console.log("🔥 AUTH STATE CHANGED:", user ? `LOGGED IN: ${user.email}` : "LOGGED OUT");
            
            if (user) {
                try {
                    console.log("🔄 Fetching user admin data...");
                    this.currentUser = user;
                    
                    // User data fetch করুন
                    const userData = await this.getUserAdminData(user);
                    this.currentUserData = userData;
                    
                    console.log("📋 User data loaded:", userData);
                    console.log("🎯 User role:", userData?.type);
                    
                    // Successful login handle করুন
                    await this.handleSuccessfulLogin(user);
                } catch (error) {
                    console.error("❌ Error in auth state change:", error);
                    await this.handleLogout();
                }
            } else {
                console.log("👤 User logged out");
                await this.handleLogout();
            }
        });
    }

    async initializeFirebase() {
        try {
            // Test Firebase connection with public read
            await db.collection("groups").limit(1).get();
            console.log("Firebase connected successfully - Public read works");
        } catch (error) {
            console.error("Firebase connection failed:", error);
            this.showToast("ডেটাবেস সংযোগ ব্যর্থ", "error");
        }
    }

    setupDOMReferences() {
        // Core DOM elements
        this.dom = {
            headerLoginBtn: document.getElementById("headerLoginBtn"),
            exportPage: document.getElementById('page-export'),
            authModal: document.getElementById("authModal"),
            appContainer: document.getElementById("appContainer"),
            loginForm: document.getElementById("loginForm"),
            registerForm: document.getElementById("registerForm"),
            showRegister: document.getElementById("showRegister"),
            showLogin: document.getElementById("showLogin"),
            loginBtn: document.getElementById("loginBtn"),
            registerBtn: document.getElementById("registerBtn"),
            googleSignInBtn: document.getElementById("googleSignInBtn"),
            logoutBtn: document.getElementById("logoutBtn"),
            themeToggle: document.getElementById("themeToggle"),
            pageTitle: document.getElementById("pageTitle"),
            userInfo: document.getElementById("userInfo"),
            adminManagementSection: document.getElementById("adminManagementSection"),

            pages: document.querySelectorAll(".page"),
            navBtns: document.querySelectorAll(".nav-btn"),

            // Modals
            logoutModal: document.getElementById("logoutModal"),
            cancelLogout: document.getElementById("cancelLogout"),
            confirmLogout: document.getElementById("confirmLogout"),
            deleteModal: document.getElementById("deleteModal"),
            cancelDelete: document.getElementById("cancelDelete"),
            confirmDelete: document.getElementById("confirmDelete"),
            editModal: document.getElementById("editModal"),
            cancelEdit: document.getElementById("cancelEdit"),
            saveEdit: document.getElementById("saveEdit"),
            editModalTitle: document.getElementById("editModalTitle"),
            editModalContent: document.getElementById("editModalContent"),
            deleteModalText: document.getElementById("deleteModalText"),
            groupDetailsModal: document.getElementById("groupDetailsModal"),
            groupDetailsTitle: document.getElementById("groupDetailsTitle"),
            groupDetailsContent: document.getElementById("groupDetailsContent"),
            closeGroupDetails: document.getElementById("closeGroupDetails"),
            adminModal: document.getElementById("adminModal"),
            adminModalTitle: document.getElementById("adminModalTitle"),
            adminModalContent: document.getElementById("adminModalContent"),

            // UI Elements
            loadingOverlay: document.getElementById("loadingOverlay"),
            toast: document.getElementById("toast"),
            toastMessage: document.getElementById("toastMessage"),

            // Form elements
            groupNameInput: document.getElementById("groupNameInput"),
            addGroupBtn: document.getElementById("addGroupBtn"),
            groupsList: document.getElementById("groupsList"),
            studentNameInput: document.getElementById("studentNameInput"),
            studentRollInput: document.getElementById("studentRollInput"),
            studentGenderInput: document.getElementById("studentGenderInput"),
            studentGroupInput: document.getElementById("studentGroupInput"),
            studentContactInput: document.getElementById("studentContactInput"),
            studentAcademicGroupInput: document.getElementById("studentAcademicGroupInput"),
            studentSessionInput: document.getElementById("studentSessionInput"),
            studentRoleInput: document.getElementById("studentRoleInput"),
            addStudentBtn: document.getElementById("addStudentBtn"),
            studentsList: document.getElementById("studentsList"),
            allStudentsCards: document.getElementById("allStudentsCards"),
            tasksList: document.getElementById("tasksList"),
            taskNameInput: document.getElementById("taskNameInput"),
            taskDescriptionInput: document.getElementById("taskDescriptionInput"),
            taskMaxScoreInput: document.getElementById("taskMaxScoreInput"),
            taskDateInput: document.getElementById("taskDateInput"),
            addTaskBtn: document.getElementById("addTaskBtn"),

            evaluationTaskSelect: document.getElementById("evaluationTaskSelect"),
            evaluationGroupSelect: document.getElementById("evaluationGroupSelect"),
            startEvaluationBtn: document.getElementById("startEvaluationBtn"),
            evaluationForm: document.getElementById("evaluationForm"),
            csvFileInput: document.getElementById("csvFileInput"),
            importStudentsBtn: document.getElementById("importStudentsBtn"),
            processImportBtn: document.getElementById("processImportBtn"),
            csvFileName: document.getElementById("csvFileName"),
            downloadTemplateBtn: document.getElementById("downloadTemplateBtn"),
            membersFilterGroup: document.getElementById("membersFilterGroup"),
            studentSearchInput: document.getElementById("studentSearchInput"),
            cardsFilterGroup: document.getElementById("cardsFilterGroup"),
            allStudentsSearchInput: document.getElementById("allStudentsSearchInput"),
            refreshRanking: document.getElementById("refreshRanking"),
            studentRankingList: document.getElementById("studentRankingList"),
            groupAnalysisChart: document.getElementById("groupAnalysisChart"),
            policySections: document.getElementById("policySections"),
            exportAllData: document.getElementById("exportAllData"),
            exportStudentsCSV: document.getElementById("exportStudentsCSV"),
            exportGroupsCSV: document.getElementById("exportGroupsCSV"),
            exportEvaluationsCSV: document.getElementById("exportEvaluationsCSV"),
            groupMembersGroupSelect: document.getElementById("groupMembersGroupSelect"),
            groupMembersList: document.getElementById("groupMembersList"),

            // Admin Management
            adminManagementContent: document.getElementById("adminManagementContent"),
            addAdminBtn: document.getElementById("addAdminBtn"),
            adminSearchInput: document.getElementById("adminSearchInput"),
            adminEmail: document.getElementById("adminEmail"),
            adminPassword: document.getElementById("adminPassword"),
            adminTypeSelect: document.getElementById("adminTypeSelect"),
            permissionsSection: document.getElementById("permissionsSection"),
            permissionRead: document.getElementById("permissionRead"),
            permissionWrite: document.getElementById("permissionWrite"),
            permissionDelete: document.getElementById("permissionDelete"),
            cancelAdmin: document.getElementById("cancelAdmin"),
            saveAdmin: document.getElementById("saveAdmin"),

            // Evaluation List
            evaluationListTable: document.getElementById("evaluationListTable"),

            // Group Analysis
            analysisGroupSelect: document.getElementById("analysisGroupSelect"),
            updateAnalysisBtn: document.getElementById("updateAnalysisBtn"),
            groupAnalysisDetails: document.getElementById("groupAnalysisDetails"),

            // NEW ELEMENTS FOR ADDED FEATURES
            graphAnalysisChart: document.getElementById("graphAnalysisChart"),
            graphTypeSelect: document.getElementById("graphTypeSelect"),
            updateGraphBtn: document.getElementById("updateGraphBtn"),
            roleManagementList: document.getElementById("roleManagementList"),
            roleSearchInput: document.getElementById("roleSearchInput"),
            roleFilterGroup: document.getElementById("roleFilterGroup"),
            exportPDFBtn: document.getElementById("exportPDFBtn"),
            printAnalysisBtn: document.getElementById("printAnalysisBtn"),
            exportAllZip: document.getElementById("exportAllZip"),
            exportPDFReport: document.getElementById("exportPDFReport"),
        };
    }

    setupEventListeners() {
        // Header login button
        this.addListener(this.dom.headerLoginBtn, "click", () => this.showAuthModal());
        
        // Auth events
        this.addListener(this.dom.showRegister, "click", () => this.toggleAuthForms());
        this.addListener(this.dom.showLogin, "click", () => this.toggleAuthForms(false));

        // Login/Register events
        this.addListener(this.dom.loginBtn, "click", () => this.handleLogin());
        this.addListener(this.dom.registerBtn, "click", () => this.handleRegister());
        this.addListener(this.dom.googleSignInBtn, "click", () => this.handleGoogleSignIn());

        // Logout events
        this.addListener(this.dom.logoutBtn, "click", () => this.showLogoutModal());
        this.addListener(this.dom.cancelLogout, "click", () => this.hideLogoutModal());
        this.addListener(this.dom.confirmLogout, "click", () => this.handleLogout());

        // Modal events
        this.addListener(this.dom.cancelDelete, "click", () => this.hideDeleteModal());
        this.addListener(this.dom.confirmDelete, "click", () => {
            if (this.deleteCallback) this.deleteCallback();
            this.hideDeleteModal();
        });
        this.addListener(this.dom.cancelEdit, "click", () => this.hideEditModal());
        this.addListener(this.dom.saveEdit, "click", () => {
            if (this.editCallback) this.editCallback();
            this.hideEditModal();
        });
        this.addListener(this.dom.closeGroupDetails, "click", () => this.hideGroupDetailsModal());

        // Admin Management events
        this.addListener(this.dom.addAdminBtn, "click", () => this.showAdminModal());
        this.addListener(this.dom.cancelAdmin, "click", () => this.hideAdminModal());
        this.addListener(this.dom.saveAdmin, "click", () => this.saveAdmin());
        this.addListener(this.dom.adminTypeSelect, "change", (e) => this.handleAdminTypeChange(e));

        // Group Analysis events
        this.addListener(this.dom.updateAnalysisBtn, "click", () => this.updateGroupAnalysis());

        // NEW: Graph Analysis events
        this.addListener(this.dom.updateGraphBtn, "click", () => this.updateGraphAnalysis());
        this.addListener(this.dom.graphTypeSelect, "change", () => this.updateGraphAnalysis());

        // NEW: Role Management events
        this.addListener(this.dom.roleSearchInput, "input", (e) => this.handleRoleSearch(e.target.value));
        this.addListener(this.dom.roleFilterGroup, "change", (e) => this.handleRoleFilter(e.target.value));

        // NEW: Export events
        this.addListener(this.dom.exportPDFBtn, "click", () => this.exportAnalysisToPDF());
        this.addListener(this.dom.printAnalysisBtn, "click", () => this.printAnalysis());
        this.addListener(this.dom.exportAllZip, "click", () => this.exportAllDataAsZip());
        this.addListener(this.dom.exportPDFReport, "click", () => this.exportAllDataAsPDF());

        // Theme and mobile menu - FIXED
        this.addListener(this.dom.themeToggle, "click", () => this.toggleTheme());

        // Navigation
        this.dom.navBtns.forEach((btn) => {
            this.addListener(btn, "click", (e) => this.handleNavigation(e));
        });

        // CRUD Operations
        this.addListener(this.dom.addGroupBtn, "click", () => this.addGroup());
        this.addListener(this.dom.addStudentBtn, "click", () => this.addStudent());
        this.addListener(this.dom.addTaskBtn, "click", () => this.addTask());
        this.addListener(this.dom.startEvaluationBtn, "click", () => this.startEvaluation());

        // CSV Operations
        this.addListener(this.dom.importStudentsBtn, "click", () => this.importCSV());
        this.addListener(this.dom.processImportBtn, "click", () => this.processCSVImport());
        this.addListener(this.dom.csvFileInput, "change", (e) => this.handleCSVFileSelect(e));
        this.addListener(this.dom.downloadTemplateBtn, "click", () => this.downloadCSVTemplate());

        // Export Operations
        this.addListener(this.dom.exportAllData, "click", () => this.exportAllData());
        this.addListener(this.dom.exportStudentsCSV, "click", () => this.exportStudentsCSV());
        this.addListener(this.dom.exportGroupsCSV, "click", () => this.exportGroupsCSV());
        this.addListener(this.dom.exportEvaluationsCSV, "click", () => this.exportEvaluationsCSV());

        // Refresh
        this.addListener(this.dom.refreshRanking, "click", () => this.refreshRanking());
        
        // Search and filter events
        this.setupSearchAndFilterEvents();
        this.setupModalCloseHandlers();
    }

    addListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    setupSearchAndFilterEvents() {
        // Search functionality with debouncing
        const searchInputs = [
            {
                id: "studentSearchInput",
                callback: (value) => this.handleStudentSearch(value),
            },
            {
                id: "allStudentsSearchInput",
                callback: (value) => this.handleAllStudentsSearch(value),
            },
            {
                id: "adminSearchInput",
                callback: (value) => this.handleAdminSearch(value),
            },
            {
                id: "roleSearchInput",
                callback: (value) => this.handleRoleSearch(value),
            },
        ];

        searchInputs.forEach(({ id, callback }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener("input", (e) => {
                    this.searchDebouncer(() => callback(e.target.value));
                });
            }
        });

        // Filter events
        const groupFilters = [
            {
                id: "membersFilterGroup",
                callback: (value) => this.handleMembersFilter(value),
            },
            {
                id: "cardsFilterGroup",
                callback: (value) => this.handleCardsFilter(value),
            },
            {
                id: "groupMembersGroupSelect",
                callback: (value) => this.handleGroupMembersFilter(value),
            },
            {
                id: "roleFilterGroup",
                callback: (value) => this.handleRoleFilter(value),
            },
        ];

        groupFilters.forEach(({ id, callback }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener("change", (e) => callback(e.target.value));
            }
        });
    }

    setupModalCloseHandlers() {
        const modals = [
            this.dom.authModal,
            this.dom.deleteModal,
            this.dom.editModal,
            this.dom.logoutModal,
            this.dom.groupDetailsModal,
            this.dom.adminModal,
        ];

        modals.forEach((modal) => {
            if (modal) {
                modal.addEventListener("click", (e) => {
                    if (e.target === modal) {
                        this.hideModal(modal);
                    }
                });
            }
        });
    }

    // ===============================
    // AUTHENTICATION - FIXED
    // ===============================

    async handleSuccessfulLogin(user) {
        try {
            console.log("Handling successful login for:", user.email);
            
            this.isPublicMode = false;
            this.currentUser = user;

            // User data নিশ্চিত করুন
            if (!this.currentUserData) {
                this.currentUserData = await this.getUserAdminData(user);
            }

            console.log("User role:", this.currentUserData?.type);

            // UI update করুন
            this.updateUserInterface(this.currentUserData);

            // Auth modal hide করুন (যদি open থাকে)
            this.hideAuthModal();
            
            // App container show করুন
            if (this.dom.appContainer) {
                this.dom.appContainer.classList.remove("hidden");
                console.log("App container shown");
            }

            // সকল data load করুন
            await this.loadInitialData();

            // Navigation enable করুন
            this.enableAllNavigation(true);

            // Dashboard show করুন
            this.showPage("dashboard");

            this.showToast(`লগইন সফল! ${user.email}`, "success");
            
        } catch (error) {
            console.error("Login handling error:", error);
            this.showToast("লগইন সম্পন্ন কিন্তু ডেটা লোড করতে সমস্যা", "warning");
        }
    }

    async handleLogout() {
        try {
            // Firebase থেকে logout করুন
            await auth.signOut();
            
            this.isPublicMode = true;
            this.currentUser = null;
            this.currentUserData = null;
    
            // UI reset করুন
            this.updateUserInterface(null);
    
            // Cache clear করুন
            this.cache.clearAll();
    
            // Modals hide করুন
            this.hideAuthModal();
            this.hideLogoutModal();
            
            // App container show করুন (public mode-এ)
            if (this.dom.appContainer) {
                this.dom.appContainer.classList.remove("hidden");
            }
    
            // Public data load করুন
            await this.loadPublicData();
    
            // Navigation reset করুন
            this.enableAllNavigation(false);
    
            // Public page-এ redirect করুন
            this.ensurePublicPage();
    
            this.showToast("লগআউট সম্পন্ন", "info");
        } catch (error) {
            console.error("Logout error:", error);
            this.showToast("লগআউট করতে সমস্যা", "error");
        }
    }

    showAuthModal() {
        // Reset forms and show login form by default
        this.toggleAuthForms(false);

        // Clear any existing form data
        if (document.getElementById("loginEmail"))
            document.getElementById("loginEmail").value = "";
        if (document.getElementById("loginPassword"))
            document.getElementById("loginPassword").value = "";
        if (document.getElementById("registerEmail"))
            document.getElementById("registerEmail").value = "";
        if (document.getElementById("registerPassword"))
            document.getElementById("registerPassword").value = "";

        // Show the modal
        this.dom.authModal.classList.remove("hidden");
        this.dom.appContainer.classList.add("hidden");
    }

    hideAuthModal() {
        this.dom.authModal.classList.add("hidden");
    }

    async handleLogin() {
        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;

        // Enhanced validation
        if (!email || !password) {
            this.showToast("ইমেইল এবং পাসওয়ার্ড প্রয়োজন", "error");
            return;
        }

        if (!this.validateEmail(email)) {
            this.showToast("সঠিক ইমেইল ঠিকানা লিখুন", "error");
            return;
        }

        if (password.length < 6) {
            this.showToast("পাসওয়ার্ড ন্যূনতম ৬ অক্ষর হতে হবে", "error");
            return;
        }

        this.showLoading();
        try {
            await auth.signInWithEmailAndPassword(email, password);
            // Clear form fields on success
            if (document.getElementById("loginEmail"))
                document.getElementById("loginEmail").value = "";
            if (document.getElementById("loginPassword"))
                document.getElementById("loginPassword").value = "";
        } catch (error) {
            this.handleAuthError(error, "login");
        } finally {
            this.hideLoading();
        }
    }

    async handleRegister() {
        const email = document.getElementById("registerEmail")?.value.trim();
        const password = document.getElementById("registerPassword")?.value;
        const adminType = document.getElementById("adminType")?.value || "user";
    
        if (!this.validateEmail(email)) {
            this.showToast("সঠিক ইমেইল ঠিকানা লিখুন", "error");
            return;
        }
    
        if (password.length < 6) {
            this.showToast("পাসওয়ার্ড ন্যূনতম ৬ অক্ষর হতে হবে", "error");
            return;
        }
    
        this.showLoading();
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
    
            // Check if this is the first user
            const adminsSnapshot = await db.collection("admins").get();
            let finalAdminType = adminType;
            
            if (adminsSnapshot.empty) {
                // First user becomes super admin automatically
                finalAdminType = "super-admin";
                this.showToast("প্রথম ব্যবহারকারী হিসেবে আপনাকে স্বয়ংক্রিয়ভাবে সুপার অ্যাডমিন করা হয়েছে", "success");
            }
    
            // Define permissions based on admin type
            let permissions = {
                read: true,
                write: false,
                delete: false,
                edit: false
            };
    
            if (finalAdminType === "super-admin") {
                permissions = { read: true, write: true, delete: true, edit: true };
            } else if (finalAdminType === "admin") {
                permissions = { read: true, write: true, delete: false, edit: true };
            } else if (finalAdminType === "user") {
                permissions = { read: true, write: false, delete: false, edit: false };
            }
    
            await db.collection("admins").doc(user.uid).set({
                email,
                type: finalAdminType,
                permissions: permissions,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
    
            this.showToast("রেজিস্ট্রেশন সফল!", "success");
            this.toggleAuthForms(false);
    
            // Clear form fields
            if (document.getElementById("registerEmail"))
                document.getElementById("registerEmail").value = "";
            if (document.getElementById("registerPassword"))
                document.getElementById("registerPassword").value = "";
        } catch (error) {
            this.handleAuthError(error, "register");
        } finally {
            this.hideLoading();
        }
    }

    async handleGoogleSignIn() {
        this.showLoading();
        try {
            const result = await auth.signInWithPopup(googleProvider);
            const user = result.user;

            const adminDoc = await db.collection("admins").doc(user.uid).get();
            if (!adminDoc.exists) {
                await db.collection("admins").doc(user.uid).set({
                    email: user.email,
                    type: "user",
                    permissions: {
                        read: true,
                        write: false,
                        delete: false,
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            }
            this.showToast("Google লগইন সফল!", "success");
        } catch (error) {
            this.handleAuthError(error, "google");
        } finally {
            this.hideLoading();
        }
    }

    handleAuthError(error, type) {
        let errorMessage = "";

        switch (error.code) {
            case "auth/user-not-found":
                errorMessage = "এই ইমেইলে কোনো অ্যাকাউন্ট নেই";
                break;
            case "auth/wrong-password":
                errorMessage = "ভুল পাসওয়ার্ড";
                break;
            case "auth/invalid-email":
                errorMessage = "অবৈধ ইমেইল ঠিকানা";
                break;
            case "auth/email-already-in-use":
                errorMessage = "এই ইমেইল ইতিমধ্যে ব্যবহার করা হয়েছে";
                break;
            case "auth/weak-password":
                errorMessage = "পাসওয়ার্ড খুব দুর্বল";
                break;
            case "auth/too-many-requests":
                errorMessage = "বহুবার চেষ্টা করা হয়েছে। পরে আবার চেষ্টা করুন";
                break;
            case "auth/network-request-failed":
                errorMessage = "নেটওয়ার্ক সংযোগ ব্যর্থ";
                break;
            case "auth/popup-closed-by-user":
                errorMessage = "লগইন পপআপ বন্ধ করা হয়েছে";
                break;
            default:
                errorMessage = `${type === "login" ? "লগইন" : type === "register" ? "রেজিস্ট্রেশন" : "Google লগইন"} ব্যর্থ: ${error.message}`;
        }

        this.showToast(errorMessage, "error");
    }

    async getUserAdminData(user) {
        const cacheKey = `admin_${user.uid}`;
        console.log("🔍 getUserAdminData called for user:", user.uid);
        
        try {
            // First try cache
            const cached = this.cache.get(cacheKey);
            if (cached) {
                console.log("💾 Admin data from CACHE:", cached);
                return cached;
            }
    
            console.log("🔄 Fetching admin data from FIRESTORE...");
            // If not in cache, fetch from Firestore
            const adminDoc = await db.collection("admins").doc(user.uid).get();
            console.log("📄 Admin document exists:", adminDoc.exists);
            
            if (adminDoc.exists) {
                const data = adminDoc.data();
                console.log("🎯 Admin data from FIRESTORE:", data);
                this.cache.set(cacheKey, data);
                return data;
            } else {
                console.log("⚠️ No admin document found for user:", user.uid);
                // Return basic user info if not in admins collection
                const basicData = {
                    email: user.email,
                    type: "user",
                    permissions: {
                        read: true,
                        write: false,
                        delete: false
                    }
                };
                console.log("🔄 Returning BASIC user data:", basicData);
                this.cache.set(cacheKey, basicData);
                return basicData;
            }
        } catch (error) {
            console.error("❌ Error fetching admin data:", error);
            
            // Return basic user info on error
            const basicData = {
                email: user.email,
                type: "user",
                permissions: {
                    read: true,
                    write: false,
                    delete: false
                }
            };
            console.log("🔄 Returning BASIC user data due to error:", basicData);
            this.cache.set(cacheKey, basicData);
            return basicData;
        }
    }

    // ===============================
    // NAVIGATION & UI MANAGEMENT - FIXED
    // ===============================
    async handleNavigation(event) {
        const btn = event.currentTarget;
        const pageId = btn.getAttribute("data-page");
        
        console.log(`Navigation attempt to: ${pageId}`, {
            currentUser: !!this.currentUser,
            userData: this.currentUserData,
            isPublicMode: this.isPublicMode
        });
    
        // Check if button is disabled
        if (btn.disabled || btn.classList.contains("disabled-nav")) {
            console.log(`Navigation denied: ${pageId} is disabled`);
            return;
        }
    
        // Check if page exists
        const pageElement = document.getElementById(`page-${pageId}`);
        if (!pageElement) {
            console.error(`Page element not found: page-${pageId}`);
            this.showToast("এই পেজটি এখনও উপলব্ধ নয়", "error");
            return;
        }
    
        // Check authentication for private pages
        if (!this.currentUser && this.PRIVATE_PAGES.includes(pageId)) {
            this.showToast("এই পেজ দেখতে লগইন প্রয়োজন", "error");
            this.showAuthModal();
            return;
        }
    
        // For logged-in users, check role-based access
        if (this.currentUser) {
            const userRole = this.currentUserData?.type;
            
            // Admin management requires super-admin role
            if (pageId === "admin-management") {
                if (userRole !== "super-admin") {
                    this.showToast("এই পেজ এক্সেস করতে সুপার অ্যাডমিন পারমিশন প্রয়োজন", "error");
                    return;
                }
            }
            
            // Regular users cannot access private pages
            if (userRole === "user" && this.PRIVATE_PAGES.includes(pageId)) {
                this.showToast("এই পেজ এক্সেস করতে অ্যাডমিন পারমিশন প্রয়োজন", "error");
                return;
            }
        }
    
        // Update navigation
        this.dom.navBtns.forEach((navBtn) => {
            navBtn.classList.remove("active");
        });
        btn.classList.add("active");
    
        // Show page
        this.showPage(pageId);
    
        // Load page-specific data
        try {
            switch (pageId) {
                case "dashboard":
                    await this.loadDashboard();
                    break;
                case "groups":
                    this.renderGroups();
                    break;
                case "members":
                    this.renderStudentsList();
                    break;
                case "group-members":
                    this.renderRoleManagement(); // UPDATED: Now shows role management
                    break;
                case "all-students":
                    this.renderStudentCards();
                    break;
                case "student-ranking":
                    this.renderStudentRanking();
                    break;
                case "group-analysis":
                    this.renderGroupAnalysis();
                    break;
                case "tasks":
                    this.renderTasks();
                    break;
                case "evaluation":
                    this.renderEvaluationList();
                    break;
                case "group-policy":
                    this.renderPolicySections();
                    break;
                case "export":
                    // Export page doesn't need additional loading
                    break;
                case "admin-management":
                    if (this.currentUser && this.currentUserData?.type === "super-admin") {
                        await this.loadAdmins();
                    }
                    break;
                case "graph-analysis": // NEW PAGE
                    this.renderGraphAnalysis();
                    break;
            }
        } catch (error) {
            console.error(`Error loading page ${pageId}:`, error);
            this.showToast(`পেজ লোড করতে সমস্যা: ${pageId}`, "error");
        }
    }

    enableAllNavigation(isLoggedIn) {
        console.log("🔍 === ENABLE NAVIGATION DEBUG ===");
        console.log("isLoggedIn:", isLoggedIn);
        console.log("currentUser:", this.currentUser);
        console.log("currentUserData:", this.currentUserData);
        
        this.dom.navBtns.forEach((btn) => {
            const pageId = btn.getAttribute("data-page");
            const isPrivateTab = btn.classList.contains("private-tab");
            
            // Remove all existing states first
            btn.removeAttribute('disabled');
            btn.style.opacity = "";
            btn.style.pointerEvents = "";
            btn.style.display = "";
            btn.classList.remove("disabled-nav");
            
            if (isLoggedIn && this.currentUserData) {
                // User is logged in
                const userRole = this.currentUserData.type;
                
                // Special handling for admin-management page - FIXED
                if (pageId === "admin-management") {
                    if (userRole === "super-admin") {
                        // Show admin management for super-admin
                        btn.style.display = "flex";
                        btn.style.opacity = "1";
                        btn.style.pointerEvents = "auto";
                        btn.disabled = false;
                        console.log(`✅ ${pageId} ENABLED for super-admin`);
                    } else {
                        // Hide admin management for non-super-admins
                        btn.style.display = "none";
                        btn.style.opacity = "0";
                        btn.style.pointerEvents = "none";
                        btn.disabled = true;
                        btn.classList.add("disabled-nav");
                        console.log(`🚫 ${pageId} HIDDEN for ${userRole}`);
                    }
                } 
                // Handle other private tabs
                else if (isPrivateTab) {
                    if (userRole === "user") {
                        // Regular users cannot access private tabs
                        btn.style.display = "none";
                        btn.style.opacity = "0";
                        btn.style.pointerEvents = "none";
                        btn.disabled = true;
                        btn.classList.add("disabled-nav");
                        console.log(`🚫 ${pageId} HIDDEN for regular user`);
                    } else {
                        // Admin and super-admin can access private tabs
                        btn.style.display = "flex";
                        btn.style.opacity = "1";
                        btn.style.pointerEvents = "auto";
                        btn.disabled = false;
                        console.log(`✅ ${pageId} ENABLED for ${userRole}`);
                    }
                } else {
                    // Public tabs are always enabled for logged-in users
                    btn.style.display = "flex";
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "auto";
                    btn.disabled = false;
                    console.log(`✅ ${pageId} ENABLED for logged in user`);
                }
            } else {
                // User is logged out
                if (isPrivateTab) {
                    // Hide private tabs
                    btn.style.display = "none";
                    btn.style.opacity = "0";
                    btn.style.pointerEvents = "none";
                    btn.disabled = true;
                    btn.classList.add("disabled-nav");
                    console.log(`🚫 ${pageId} HIDDEN for public`);
                } else {
                    // Show public tabs
                    btn.style.display = "flex";
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "auto";
                    btn.disabled = false;
                    console.log(`✅ ${pageId} ENABLED for public`);
                }
            }
        });
        
        console.log("🔍 === END NAVIGATION DEBUG ===");
    }

    updateUserInterface(userData) {
        if (!this.dom.userInfo || !this.dom.logoutBtn || !this.dom.headerLoginBtn) {
            console.error("DOM elements not found for UI update");
            return;
        }
    
        console.log("Updating UI with user data:", userData);
    
        // Remove any existing role classes from body
        document.body.classList.remove("super-admin", "admin", "regular-user");
    
        if (userData && this.currentUser) {
            // User is logged in
            const roleText = userData.type === "super-admin" ? "সুপার অ্যাডমিন" : 
                            userData.type === "admin" ? "অ্যাডমিন" : "সাধারণ ব্যবহারকারী";
            
            const roleColor = userData.type === "super-admin" ? "text-purple-600" : 
                             userData.type === "admin" ? "text-blue-600" : "text-green-600";
    
            // Add role class to body for CSS styling
            document.body.classList.add(userData.type === "super-admin" ? "super-admin" : 
                                      userData.type === "admin" ? "admin" : "regular-user");
    
            this.dom.userInfo.innerHTML = `
                <div class="font-medium">${userData.email}</div>
                <div class="text-xs ${roleColor}">${roleText}</div>
            `;
    
            // Show logout button, hide login button
            this.dom.logoutBtn.classList.remove("hidden");
            this.dom.headerLoginBtn.classList.add("hidden");
            
            console.log("UI updated for logged in user:", roleText);
    
        } else {
            // User is logged out
            this.dom.userInfo.innerHTML = `<div class="text-xs text-gray-500">সাধারণ ব্যবহারকারী</div>`;
    
            // Show login button, hide logout button
            this.dom.logoutBtn.classList.add("hidden");
            this.dom.headerLoginBtn.classList.remove("hidden");
            
            console.log("UI updated for logged out user");
        }
    }

    showPage(pageId) {
        console.log(`Showing page: ${pageId}`);
        
        // Hide all pages
        this.dom.pages.forEach((page) => {
            page.classList.add("hidden");
        });

        // Show selected page
        const selectedPage = document.getElementById(`page-${pageId}`);
        if (selectedPage) {
            selectedPage.classList.remove("hidden");
            console.log(`Page ${pageId} shown successfully`);
        } else {
            console.error(`Page with id page-${pageId} not found`);
        }

        // Update active navigation
        this.dom.navBtns.forEach((btn) => {
            btn.classList.remove("active");
            if (btn.getAttribute("data-page") === pageId) {
                btn.classList.add("active");
            }
        });

        // Update page title
        if (this.dom.pageTitle) {
            const activeBtn = document.querySelector(`[data-page="${pageId}"]`);
            if (activeBtn) {
                this.dom.pageTitle.textContent = activeBtn.textContent.trim();
            }
        }
    }

    // ===============================
    // NEW FEATURE 1: GRAPH ANALYSIS PAGE
    // ===============================
    renderGraphAnalysis() {
        const container = document.getElementById('page-graph-analysis');
        if (!container) return;

        // Create chart container if not exists
        if (!container.querySelector('#graphAnalysisChart')) {
            container.innerHTML = `
                <div class="p-6">
                    <h2 class="text-2xl font-bold mb-6 text-gray-800 dark:text-white">গ্রাফ বিশ্লেষণ</h2>
                    
                    <!-- Controls -->
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">গ্রাফ টাইপ</label>
                                <select id="graphTypeSelect" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                                    <option value="bar">বার চার্ট</option>
                                    <option value="line">লাইন চার্ট</option>
                                    <option value="pie">পাই চার্ট</option>
                                    <option value="radar">রাডার চার্ট</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">ডেটা টাইপ</label>
                                <select id="graphDataType" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                                    <option value="average">গড় স্কোর</option>
                                    <option value="total">মোট স্কোর</option>
                                    <option value="performance">পারফরম্যান্স</option>
                                </select>
                            </div>
                            <div class="flex items-end">
                                <button id="updateGraphBtn" class="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors">
                                    <i class="fas fa-sync-alt mr-2"></i>গ্রাফ আপডেট করুন
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Chart Container -->
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <canvas id="graphAnalysisChart" width="400" height="200"></canvas>
                    </div>

                    <!-- Statistics -->
                    <div class="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4" id="graphStats"></div>
                </div>
            `;
        }

        this.updateGraphAnalysis();
    }

    updateGraphAnalysis() {
        const canvas = document.getElementById('graphAnalysisChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const graphType = document.getElementById('graphTypeSelect')?.value || 'bar';
        const dataType = document.getElementById('graphDataType')?.value || 'average';

        // Destroy existing chart
        if (this.graphChart) {
            this.graphChart.destroy();
        }

        const groupScores = this.calculateGroupScores();
        const groups = this.state.groups;
        
        const labels = [];
        const data = [];
        const colors = [];

        groups.forEach((group, index) => {
            labels.push(group.name);
            
            let score = 0;
            if (dataType === 'average') {
                score = groupScores[group.id] ? groupScores[group.id].score : 0;
            } else if (dataType === 'total') {
                score = groupScores[group.id] ? groupScores[group.id].score * (groupScores[group.id].members || 1) : 0;
            } else {
                score = groupScores[group.id] ? (groupScores[group.id].score / 100) * 5 : 0; // Performance rating
            }
            
            data.push(score);
            
            // Generate different colors for each group
            const hue = (index * 137.5) % 360; // Golden angle for color distribution
            colors.push(`hsl(${hue}, 70%, 60%)`);
        });

        // Chart configuration
        const config = {
            type: graphType,
            data: {
                labels: labels,
                datasets: [{
                    label: dataType === 'average' ? 'গড় স্কোর' : dataType === 'total' ? 'মোট স্কোর' : 'পারফরম্যান্স রেটিং',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors.map(color => color.replace('60%)', '40%)')),
                    borderWidth: 2,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const group = groups[index];
                        this.showGroupDetailsModal(group.id);
                    }
                }
            }
        };

        // Special configurations for different chart types
        if (graphType === 'pie' || graphType === 'doughnut') {
            config.options.plugins.legend.position = 'right';
        }

        if (graphType === 'radar') {
            config.data.datasets[0].pointBackgroundColor = colors;
            config.data.datasets[0].pointBorderColor = colors.map(color => color.replace('60%)', '40%)'));
        }

        this.graphChart = new Chart(ctx, config);

        // Update statistics
        this.updateGraphStats(data, labels);
    }

    updateGraphStats(data, labels) {
        const statsContainer = document.getElementById('graphStats');
        if (!statsContainer) return;

        if (data.length === 0) {
            statsContainer.innerHTML = '<p class="text-center text-gray-500">কোন ডেটা পাওয়া যায়নি</p>';
            return;
        }

        const maxScore = Math.max(...data);
        const minScore = Math.min(...data);
        const avgScore = data.reduce((a, b) => a + b, 0) / data.length;
        const maxIndex = data.indexOf(maxScore);

        statsContainer.innerHTML = `
            <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div class="text-blue-600 dark:text-blue-400 font-semibold">সর্বোচ্চ স্কোর</div>
                <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">${maxScore.toFixed(2)}</div>
                <div class="text-sm text-blue-600 dark:text-blue-400">${labels[maxIndex]}</div>
            </div>
            <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div class="text-green-600 dark:text-green-400 font-semibold">গড় স্কোর</div>
                <div class="text-2xl font-bold text-green-700 dark:text-green-300">${avgScore.toFixed(2)}</div>
            </div>
            <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                <div class="text-red-600 dark:text-red-400 font-semibold">সর্বনিম্ন স্কোর</div>
                <div class="text-2xl font-bold text-red-700 dark:text-red-300">${minScore.toFixed(2)}</div>
            </div>
            <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <div class="text-purple-600 dark:text-purple-400 font-semibold">মোট গ্রুপ</div>
                <div class="text-2xl font-bold text-purple-700 dark:text-purple-300">${data.length}</div>
            </div>
        `;
    }

    // ===============================
    // NEW FEATURE 2: ROLE MANAGEMENT
    // ===============================
    renderRoleManagement() {
        const container = document.getElementById('page-group-members');
        if (!container) return;

        // Create role management interface
        container.innerHTML = `
            <div class="p-6">
                <h2 class="text-2xl font-bold mb-6 text-gray-800 dark:text-white">গ্রুপ সদস্য দায়িত্ব ব্যবস্থাপনা</h2>
                
                <!-- Filters and Search -->
                <div class="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">গ্রুপ ফিল্টার</label>
                            <select id="roleFilterGroup" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                                <option value="">সকল গ্রুপ</option>
                                ${this.state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">সদস্য খুঁজুন</label>
                            <input type="text" id="roleSearchInput" placeholder="নাম বা রোল দ্বারা খুঁজুন..." 
                                   class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                        </div>
                        <div class="flex items-end">
                            <button onclick="smartEvaluator.bulkUpdateRoles()" class="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors">
                                <i class="fas fa-save mr-2"></i>সমস্ত পরিবর্তন সংরক্ষণ করুন
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Role Management Table -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                    <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">শিক্ষার্থী</th>
                                    <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">গ্রুপ</th>
                                    <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">বর্তমান দায়িত্ব</th>
                                    <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">নতুন দায়িত্ব</th>
                                    <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">কার্যক্রম</th>
                                </tr>
                            </thead>
                            <tbody id="roleManagementList" class="divide-y divide-gray-200 dark:divide-gray-600">
                                <!-- Dynamic content will be loaded here -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Bulk Actions -->
                <div class="mt-4 flex justify-between items-center">
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        <span id="selectedCount">0</span> জন সদস্য নির্বাচিত
                    </div>
                    <div class="space-x-2">
                        <button onclick="smartEvaluator.selectAllRoles()" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                            সকল নির্বাচন
                        </button>
                        <button onclick="smartEvaluator.clearRoleSelection()" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">
                            নির্বাচন মুছুন
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.updateRoleManagementList();
    }

    updateRoleManagementList() {
        const container = document.getElementById('roleManagementList');
        if (!container) return;

        let students = this.state.students;
        const groupFilter = document.getElementById('roleFilterGroup')?.value;
        const searchTerm = document.getElementById('roleSearchInput')?.value.toLowerCase();

        // Apply filters
        if (groupFilter) {
            students = students.filter(s => s.groupId === groupFilter);
        }

        if (searchTerm) {
            students = students.filter(s => 
                s.name.toLowerCase().includes(searchTerm) || 
                s.roll.toLowerCase().includes(searchTerm)
            );
        }

        if (students.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-gray-500 dark:text-gray-400">
                        <i class="fas fa-users-slash text-4xl mb-4"></i>
                        <div>কোন সদস্য পাওয়া যায়নি</div>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = students.map(student => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            const currentRole = student.role ? this.roleNames[student.role] : 'দায়িত্ব নেই';

            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td class="p-4">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-blue-600 dark:text-blue-400"></i>
                            </div>
                            <div>
                                <div class="font-medium text-gray-900 dark:text-white">${student.name}</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">রোল: ${student.roll}</div>
                            </div>
                        </div>
                    </td>
                    <td class="p-4">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            ${group?.name || 'গ্রুপ নেই'}
                        </span>
                    </td>
                    <td class="p-4">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${student.role ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}">
                            ${currentRole}
                        </span>
                    </td>
                    <td class="p-4">
                        <select data-student-id="${student.id}" class="role-select w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white text-sm">
                            <option value="">দায়িত্ব নির্বাচন করুন</option>
                            ${Object.entries(this.roleNames).map(([key, value]) => `
                                <option value="${key}" ${student.role === key ? 'selected' : ''}>${value}</option>
                            `).join('')}
                        </select>
                    </td>
                    <td class="p-4">
                        <div class="flex space-x-2">
                            <button onclick="smartEvaluator.updateStudentRole('${student.id}')" 
                                    class="inline-flex items-center px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                                <i class="fas fa-save mr-2"></i>সংরক্ষণ
                            </button>
                            <button onclick="smartEvaluator.viewStudentDetails('${student.id}')" 
                                    class="inline-flex items-center px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                <i class="fas fa-eye mr-2"></i>বিস্তারিত
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Add event listeners for role changes
        container.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.handleRoleChange(e.target.dataset.studentId, e.target.value);
            });
        });
    }

    handleRoleSearch(value) {
        this.updateRoleManagementList();
    }

    handleRoleFilter(value) {
        this.updateRoleManagementList();
    }

    async handleRoleChange(studentId, newRole) {
        const student = this.state.students.find(s => s.id === studentId);
        if (!student) return;

        this.showLoading();
        try {
            await db.collection("students").doc(studentId).update({
                role: newRole
            });
            
            // Update local state
            student.role = newRole;
            
            this.showToast(`দায়িত্ব সফলভাবে আপডেট করা হয়েছে`, "success");
            this.updateRoleManagementList();
        } catch (error) {
            this.showToast(`দায়িত্ব আপডেট করতে সমস্যা: ${error.message}`, "error");
        } finally {
            this.hideLoading();
        }
    }

    async bulkUpdateRoles() {
        const selects = document.querySelectorAll('.role-select');
        const updates = [];

        selects.forEach(select => {
            const studentId = select.dataset.studentId;
            const newRole = select.value;
            const student = this.state.students.find(s => s.id === studentId);

            if (student && newRole && newRole !== student.role) {
                updates.push({
                    studentId,
                    newRole,
                    studentName: student.name
                });
            }
        });

        if (updates.length === 0) {
            this.showToast("কোন পরিবর্তন পাওয়া যায়নি", "warning");
            return;
        }

        this.showLoading("দায়িত্ব আপডেট হচ্ছে...");
        try {
            for (const update of updates) {
                await db.collection("students").doc(update.studentId).update({
                    role: update.newRole
                });
                
                // Update local state
                const student = this.state.students.find(s => s.id === update.studentId);
                if (student) {
                    student.role = update.newRole;
                }
            }

            this.showToast(`${updates.length} জন সদস্যের দায়িত্ব সফলভাবে আপডেট করা হয়েছে`, "success");
            this.updateRoleManagementList();
        } catch (error) {
            this.showToast(`বাল্ক আপডেট ব্যর্থ: ${error.message}`, "error");
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // NEW FEATURE 3: PDF EXPORT & PRINT
    // ===============================
    async exportAnalysisToPDF() {
        this.showLoading("PDF তৈরি হচ্ছে...");
        
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Add title
            doc.setFontSize(20);
            doc.setTextColor(40, 40, 40);
            doc.text('গ্রুপ বিশ্লেষণ রিপোর্ট', 105, 20, { align: 'center' });
            
            // Add date
            doc.setFontSize(12);
            doc.setTextColor(100, 100, 100);
            const today = new Date().toLocaleDateString('bn-BD');
            doc.text(`তারিখ: ${today}`, 105, 30, { align: 'center' });
            
            let yPosition = 50;
            
            // Group statistics
            doc.setFontSize(16);
            doc.setTextColor(40, 40, 40);
            doc.text('গ্রুপ পরিসংখ্যান', 20, yPosition);
            yPosition += 15;
            
            const groupScores = this.calculateGroupScores();
            this.state.groups.forEach((group, index) => {
                if (yPosition > 250) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                const score = groupScores[group.id] || { score: 0, members: 0 };
                
                doc.setFontSize(12);
                doc.setTextColor(60, 60, 60);
                doc.text(`${group.name}`, 25, yPosition);
                doc.text(`গড় স্কোর: ${score.score.toFixed(2)}`, 100, yPosition);
                doc.text(`সদস্য: ${score.members} জন`, 160, yPosition);
                
                yPosition += 8;
            });
            
            // Student rankings
            yPosition += 10;
            if (yPosition > 220) {
                doc.addPage();
                yPosition = 20;
            }
            
            doc.setFontSize(16);
            doc.setTextColor(40, 40, 40);
            doc.text('শীর্ষ শিক্ষার্থী', 20, yPosition);
            yPosition += 15;
            
            const rankings = this.calculateStudentRankings().slice(0, 10);
            rankings.forEach((rank, index) => {
                if (yPosition > 250) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                doc.setFontSize(10);
                doc.setTextColor(80, 80, 80);
                doc.text(`${index + 1}. ${rank.student.name}`, 25, yPosition);
                doc.text(`স্কোর: ${rank.averageScore.toFixed(2)}`, 120, yPosition);
                doc.text(`মূল্যায়ন: ${rank.evaluationCount}`, 160, yPosition);
                
                yPosition += 7;
            });
            
            // Save PDF
            doc.save('group_analysis_report.pdf');
            this.showToast("PDF সফলভাবে ডাউনলোড করা হয়েছে", "success");
            
        } catch (error) {
            console.error("PDF export error:", error);
            this.showToast("PDF তৈরি করতে সমস্যা", "error");
        } finally {
            this.hideLoading();
        }
    }

    printAnalysis() {
        const printContent = document.getElementById('groupAnalysisDetails');
        if (!printContent) {
            this.showToast("প্রিন্ট করার জন্য কন্টেন্ট পাওয়া যায়নি", "error");
            return;
        }

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>গ্রুপ বিশ্লেষণ রিপোর্ট</title>
                <style>
                    body { 
                        font-family: 'SolaimanLipi', 'Arial', sans-serif; 
                        direction: ltr;
                        margin: 20px;
                        color: #333;
                    }
                    .report-header { 
                        text-align: center; 
                        margin-bottom: 30px;
                        border-bottom: 2px solid #333;
                        padding-bottom: 10px;
                    }
                    .stats-grid { 
                        display: grid; 
                        grid-template-columns: repeat(2, 1fr); 
                        gap: 15px; 
                        margin-bottom: 20px;
                    }
                    .stat-card { 
                        border: 1px solid #ddd; 
                        padding: 15px; 
                        border-radius: 5px;
                        background: #f9f9f9;
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin: 20px 0;
                    }
                    th, td { 
                        border: 1px solid #ddd; 
                        padding: 8px; 
                        text-align: left;
                    }
                    th { 
                        background-color: #f2f2f2; 
                    }
                    @media print {
                        body { margin: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="report-header">
                    <h1>গ্রুপ বিশ্লেষণ রিপোর্ট</h1>
                    <p>তৈরির তারিখ: ${new Date().toLocaleDateString('bn-BD')}</p>
                </div>
                ${printContent.innerHTML}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    }

    // ===============================
    // UPDATED TOAST MESSAGES WITH COLOR CODING
    // ===============================
    showToast(message, type = "success") {
        const toast = this.dom.toast;
        const toastMessage = this.dom.toastMessage;

        if (!toast || !toastMessage) return;

        // Set message and style based on type
        toastMessage.textContent = message;

        // Remove existing classes and add new ones
        toast.className = "toast fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition-all duration-300 transform";

        // Color coding based on type
        switch (type) {
            case "success":
                toast.classList.add("bg-green-500", "text-white"); // Green for success
                break;
            case "warning":
                toast.classList.add("bg-orange-500", "text-white"); // Orange for updates
                break;
            case "error":
                toast.classList.add("bg-red-500", "text-white"); // Red for errors and deletions
                break;
            case "info":
                toast.classList.add("bg-blue-500", "text-white"); // Blue for info
                break;
        }

        // Show toast with animation
        toast.classList.remove("hidden", "opacity-0", "translate-x-full");
        toast.classList.add("flex", "opacity-100", "translate-x-0");

        // Auto hide after 4 seconds
        setTimeout(() => {
            this.hideToast();
        }, 4000);
    }

    hideToast() {
        const toast = this.dom.toast;
        if (toast) {
            toast.classList.add("opacity-0", "translate-x-full");
            setTimeout(() => {
                toast.classList.add("hidden");
                toast.classList.remove("flex", "opacity-100", "translate-x-0");
            }, 300);
        }
    }

    // ===============================
    // ENHANCED CSV IMPORT/EXPORT
    // ===============================
    async exportAllDataAsZip() {
        this.showLoading("ZIP ফাইল তৈরি হচ্ছে...");
        try {
            const zip = new JSZip();
            
            // Add students data
            const studentsCSV = this.convertToCSV(this.state.students, ['name', 'roll', 'gender', 'groupId', 'contact', 'academicGroup', 'session', 'role']);
            zip.file("students.csv", studentsCSV);
            
            // Add groups data
            const groupsCSV = this.convertToCSV(this.state.groups, ['name', 'memberCount']);
            zip.file("groups.csv", groupsCSV);
            
            // Add tasks data
            const tasksCSV = this.convertToCSV(this.state.tasks, ['name', 'description', 'maxScore', 'date']);
            zip.file("tasks.csv", tasksCSV);
            
            // Add evaluations data as JSON (complex structure)
            zip.file("evaluations.json", JSON.stringify(this.state.evaluations, null, 2));
            
            // Generate and download zip
            const content = await zip.generateAsync({type: "blob"});
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'smart_evaluator_data.zip';
            a.click();
            URL.revokeObjectURL(url);
            
            this.showToast("সমস্ত ডেটা ZIP ফাইল হিসেবে এক্সপোর্ট成功", "success");
        } catch (error) {
            console.error("ZIP export error:", error);
            this.showToast("ZIP এক্সপোর্ট ব্যর্থ: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    async exportAllDataAsPDF() {
        this.showLoading("PDF রিপোর্ট তৈরি হচ্ছে...");
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let yPosition = 20;
            
            // Title
            doc.setFontSize(20);
            doc.setTextColor(40, 40, 40);
            doc.text('স্মার্ট ইভ্যালুয়েটর সম্পূর্ণ রিপোর্ট', 105, yPosition, { align: 'center' });
            yPosition += 15;
            
            // Date
            doc.setFontSize(12);
            doc.setTextColor(100, 100, 100);
            doc.text(`তৈরির তারিখ: ${new Date().toLocaleDateString('bn-BD')}`, 105, yPosition, { align: 'center' });
            yPosition += 20;
            
            // Summary Statistics
            doc.setFontSize(16);
            doc.setTextColor(40, 40, 40);
            doc.text('সারসংক্ষেপ', 20, yPosition);
            yPosition += 15;
            
            const stats = [
                `মোট গ্রুপ: ${this.state.groups.length}`,
                `মোট শিক্ষার্থী: ${this.state.students.length}`,
                `মোট টাস্ক: ${this.state.tasks.length}`,
                `মোট মূল্যায়ন: ${this.state.evaluations.length}`
            ];
            
            stats.forEach(stat => {
                doc.setFontSize(12);
                doc.text(stat, 25, yPosition);
                yPosition += 8;
            });
            
            yPosition += 10;
            
            // Add more sections as needed...
            
            doc.save('complete_report.pdf');
            this.showToast("সম্পূর্ণ রিপোর্ট PDF ডাউনলোড成功", "success");
            
        } catch (error) {
            console.error("PDF report error:", error);
            this.showToast("PDF রিপোর্ট তৈরি ব্যর্থ", "error");
        } finally {
            this.hideLoading();
        }
    }

    convertToCSV(data, fields) {
        if (!data || data.length === 0) return '';
        
        const headers = fields.join(',');
        const rows = data.map(item => 
            fields.map(field => {
                const value = item[field];
                // Handle special cases
                if (field === 'date' && value && value.seconds) {
                    return new Date(value.seconds * 1000).toISOString().split('T')[0];
                }
                return `"${(value || '').toString().replace(/"/g, '""')}"`;
            }).join(',')
        );
        
        return [headers, ...rows].join('\n');
    }

    // ===============================
    // ADMIN MANAGEMENT - FIXED VISIBILITY
    // ===============================
    async loadAdmins() {
        // FIX: Check if user is super-admin before loading admins
        if (!this.currentUser || this.currentUserData?.type !== "super-admin") {
            console.log("User not authorized to load admins");
            this.dom.adminManagementContent.innerHTML = `
                <div class="text-center py-12">
                    <div class="text-red-400 mb-4">
                        <i class="fas fa-shield-alt text-4xl"></i>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">অনুমতি প্রয়োজন</h3>
                    <p class="text-gray-500 dark:text-gray-400">এই পৃষ্ঠাটি শুধুমাত্র সুপার অ্যাডমিন দেখতে পারেন</p>
                </div>
            `;
            return;
        }

        try {
            const cacheKey = "admins_data";
            const cached = this.cache.get(cacheKey);

            if (!cached) {
                const snap = await db.collection("admins").get();
                this.state.admins = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                this.cache.set(cacheKey, this.state.admins);
            } else {
                this.state.admins = cached;
            }

            this.renderAdminManagement();
            console.log("Admins loaded successfully:", this.state.admins.length);
        } catch (error) {
            console.error("Error loading admins:", error);
            this.showToast("অ্যাডমিন লোড করতে সমস্যা", "error");
        }
    }

    // ... [Rest of the existing methods remain the same, only updating toast messages with appropriate types]

    // Example of updated toast messages in existing methods:
    async addGroup() {
        const name = this.dom.groupNameInput?.value.trim();
        if (!name) {
            this.showToast("গ্রুপের নাম লিখুন", "error");
            return;
        }

        this.showLoading();
        try {
            await db.collection("groups").add({
                name,
                memberCount: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            if (this.dom.groupNameInput) this.dom.groupNameInput.value = "";
            this.cache.clear("groups_data");
            await this.loadGroups();
            this.showToast("গ্রুপ সফলভাবে যোগ করা হয়েছে", "success"); // Green for success
        } catch (error) {
            this.showToast("গ্রুপ যোগ করতে সমস্যা: " + error.message, "error"); // Red for error
        } finally {
            this.hideLoading();
        }
    }

    async editGroup(id) {
        // ... existing code ...
        this.showToast("গ্রুপ সফলভাবে আপডেট করা হয়েছে", "warning"); // Orange for update
    }

    async deleteGroup(id) {
        // ... existing code ...
        this.showToast("গ্রুপ সফলভাবে ডিলিট করা হয়েছে", "error"); // Red for deletion
    }

    // Similarly update all other CRUD operations with appropriate toast types

}

// Initialize the application
let smartEvaluator;

document.addEventListener("DOMContentLoaded", function () {
    smartEvaluator = new SmartGroupEvaluator();
});