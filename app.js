// app.js - COMPLETE PROFESSIONAL VERSION WITH ALL FIXES
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
        'group-policy', 'export', 'admin-management'
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
    "graph-analysis"  
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
        this.dom = {
            // Core DOM elements
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
    
            // ✅ Admin Management (fixed)
            adminManagementContent: document.getElementById("adminManagementContent"),
            addAdminBtn: document.getElementById("addAdminBtn"),
            adminSearchInput: document.getElementById("adminSearchInput"),
            adminEmail: document.getElementById("adminEmail"),
            adminPassword: document.getElementById("adminPassword"),
            adminTypeSelect: document.getElementById("adminTypeSelect"),
            permissionsSection: document.getElementById("permissionsSection"),
            permissionRead: document.getElementById("permissionRead"),
            permissionWrite: document.getElementById("permissionWrite"),
            permissionEdit: document.getElementById("permissionEdit"), // ✅ Missing line added
            permissionDelete: document.getElementById("permissionDelete"),
            cancelAdmin: document.getElementById("cancelAdmin"),
            saveAdmin: document.getElementById("saveAdmin"),
    
            // Evaluation List
            evaluationListTable: document.getElementById("evaluationListTable"),
    
            // Group Analysis
            analysisGroupSelect: document.getElementById("analysisGroupSelect"),
            updateAnalysisBtn: document.getElementById("updateAnalysisBtn"),
            groupAnalysisDetails: document.getElementById("groupAnalysisDetails"),
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


    showToast(message, type = "info") {
        const toast = this.dom.toast;
        const toastMessage = this.dom.toastMessage;
    
        if (!toast || !toastMessage) return;
    
        // Set message and style based on type
        toastMessage.textContent = message;
    
        // Remove existing classes and add new ones
        toast.className = "toast fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition-all duration-300";
    
        // Enhanced color coding based on requirements
        switch (type) {
            case "success":
                // Green for login, logout, data addition
                toast.classList.add("bg-green-500", "text-white");
                break;
            case "warning":
                // Orange for data updates
                toast.classList.add("bg-orange-500", "text-white");
                break;
            case "error":
                // Red for errors and deletions
                toast.classList.add("bg-red-500", "text-white");
                break;
            case "info":
                // Blue for general information
                toast.classList.add("bg-blue-500", "text-white");
                break;
            default:
                toast.classList.add("bg-gray-500", "text-white");
        }
    
        // Add appropriate icon
        let icon = "fas fa-info-circle";
        switch (type) {
            case "success": icon = "fas fa-check-circle"; break;
            case "warning": icon = "fas fa-exclamation-triangle"; break;
            case "error": icon = "fas fa-times-circle"; break;
            case "info": icon = "fas fa-info-circle"; break;
        }
    
        toast.innerHTML = `
            <i class="${icon}"></i>
            <span id="toastMessage">${message}</span>
        `;
    
        // Show toast with animation
        toast.classList.remove("hidden", "opacity-0", "translate-x-full");
        toast.classList.add("flex", "opacity-100", "translate-x-0");
    
        // Auto hide after 4 seconds
        setTimeout(() => {
            this.hideToast();
        }, 4000);
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
                    type: "user", // ⚠️ এখানে সমস্যা হতে পারে!
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
                type: "user", // ⚠️ এখানেও সমস্যা!
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
                    this.renderGroupMembers();
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
                case "graph-analysis":
                    this.renderGraphAnalysis();
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
                    this.initializeExportPage();
                    break;
                case "admin-management":
                    this.loadAdmins()
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
                
                // Special handling for admin-management page
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
    // ADMIN MANAGEMENT - COMPLETELY FIXED
    // ===============================
    async loadAdmins() {
        if (!this.currentUser || !this.currentUserData || this.currentUserData.type !== "super-admin") {
            console.log("User not authorized to load admins");
            return;
        }
    
        try {
            const cacheKey = "admins_data";
            const cached = this.cache.get(cacheKey);
    
            if (!cached || cached.length === 0) {
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
    
    showAdminModal(admin = null) {
        console.log("Permission refs:", this.dom.permissionRead, this.dom.permissionWrite, this.dom.permissionEdit, this.dom.permissionDelete);


        // Check if current user is super-admin
        if (this.currentUserData?.type !== "super-admin") {
            this.showToast("শুধুমাত্র সুপার অ্যাডমিন অ্যাডমিন ম্যানেজ করতে পারেন", "error");
            return;
        }
    
        this.dom.adminModalTitle.textContent = admin ? "অ্যাডমিন সম্পাদনা" : "নতুন অ্যাডমিন যোগ করুন";
    
        if (admin) {
            // Editing existing admin
            this.dom.adminEmail.value = admin.email;
            this.dom.adminPassword.value = "";
            this.dom.adminPassword.placeholder = "পাসওয়ার্ড পরিবর্তন করতে এখানে লিখুন";
            this.dom.adminTypeSelect.value = admin.type;
            
            // Set permissions
            this.dom.permissionRead.checked = admin.permissions?.read || false;
            this.dom.permissionWrite.checked = admin.permissions?.write || false;
            this.dom.permissionEdit.checked = admin.permissions?.edit || false;
            this.dom.permissionDelete.checked = admin.permissions?.delete || false;
            
            this.currentEditingAdmin = admin;
        } else {
            // Adding new admin
            this.dom.adminEmail.value = "";
            this.dom.adminPassword.value = "";
            this.dom.adminPassword.placeholder = "পাসওয়ার্ড লিখুন";
            this.dom.adminTypeSelect.value = "admin";
            
            // Default permissions for new admin
            this.dom.permissionRead.checked = true;
            this.dom.permissionWrite.checked = true;
            this.dom.permissionEdit.checked = true;
            this.dom.permissionDelete.checked = false;
            
            this.currentEditingAdmin = null;
        }
    
        this.handleAdminTypeChange({ target: this.dom.adminTypeSelect });
        this.showModal(this.dom.adminModal);
    }
// Permission check methods
hasPermission(permission) {
    if (!this.currentUserData) return false;
    
    // Super admin has all permissions
    if (this.currentUserData.type === "super-admin") return true;
    
    // Check specific permission
    return this.currentUserData.permissions?.[permission] === true;
}

// Specific permission checks
canRead() {
    return this.hasPermission('read');
}

canWrite() {
    return this.hasPermission('write');
}

canEdit() {
    return this.hasPermission('edit');
}

canDelete() {
    return this.hasPermission('delete');
}
    handleAdminTypeChange(e) {
        const isSuperAdmin = e.target.value === "super-admin";
        if (this.dom.permissionsSection) {
            this.dom.permissionsSection.classList.toggle("hidden", !isSuperAdmin);
        }
    }

    async saveAdmin() {
        // Check if current user is super-admin for admin creation
        if (this.currentUserData?.type !== "super-admin") {
            this.showToast("শুধুমাত্র সুপার অ্যাডমিন অ্যাডমিন সেভ করতে পারেন", "error");
            return;
        }
    
        const email = this.dom.adminEmail.value.trim();
        const password = this.dom.adminPassword.value;
        const type = this.dom.adminTypeSelect.value;
        const permissions = {
            read: this.dom.permissionRead.checked,
            write: this.dom.permissionWrite.checked,
            delete: this.dom.permissionDelete.checked,
        };
    
        // Validation
        if (!this.validateEmail(email)) {
            this.showToast("সঠিক ইমেইল ঠিকানা লিখুন", "error");
            return;
        }
    
        if (!this.currentEditingAdmin && password.length < 6) {
            this.showToast("পাসওয়ার্ড ন্যূনতম ৬ অক্ষর হতে হবে", "error");
            return;
        }
    
        this.showLoading();
    
        try {
            if (this.currentEditingAdmin) {
                // Update existing admin
                await this.updateExistingAdmin(email, type, permissions, password);
            } else {
                // Create new admin
                await this.createNewAdmin(email, password, type, permissions);
            }
        } catch (error) {
            console.error("Error saving admin:", error);
            this.showToast("অ্যাডমিন সংরক্ষণ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    async updateExistingAdmin(email, type, permissions, password) {
        const updateData = {
            email,
            type,
            permissions,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        // If password is provided, update it
        if (password) {
            try {
                // Re-authenticate current user to update password
                const credential = firebase.auth.EmailAuthProvider.credential(
                    this.currentUser.email,
                    prompt("সিকিউরিটির জন্য আপনার বর্তমান পাসওয়ার্ড দিন:")
                );
                
                await reauthenticateWithCredential(this.currentUser, credential);
                
                // Update password using Admin SDK (this would require a Cloud Function)
                // For now, we'll just update the other fields
                console.log("Password update requires Cloud Function implementation");
            } catch (error) {
                this.showToast("পাসওয়ার্ড আপডেট করতে সমস্যা", "error");
                return;
            }
        }

        await db.collection("admins").doc(this.currentEditingAdmin.id).update(updateData);
        this.showToast("অ্যাডমিন সফলভাবে আপডেট করা হয়েছে", "success");
        this.hideAdminModal();
        await this.loadAdmins();
    }

    async createNewAdmin(email, password, type, permissions) {
        // Create user in Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Create admin record in Firestore
        await db.collection("admins").doc(user.uid).set({
            email,
            type,
            permissions,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: this.currentUser.uid,
        });

        this.showToast("অ্যাডমিন সফলভাবে তৈরি করা হয়েছে", "success");
        this.hideAdminModal();
        await this.loadAdmins();
    }


    // Admin Management Statistics
updateAdminStats() {
    const totalUsers = this.state.admins.length;
    const superAdminCount = this.state.admins.filter(admin => admin.type === 'super-admin').length;
    const adminCount = this.state.admins.filter(admin => admin.type === 'admin').length;
    const userCount = this.state.admins.filter(admin => admin.type === 'user').length;

    // Update stats cards
    const totalUsersEl = document.getElementById('totalUsers');
    const superAdminCountEl = document.getElementById('superAdminCount');
    const adminCountEl = document.getElementById('adminCount');
    const userCountEl = document.getElementById('userCount');

    if (totalUsersEl) totalUsersEl.textContent = totalUsers;
    if (superAdminCountEl) superAdminCountEl.textContent = superAdminCount;
    if (adminCountEl) adminCountEl.textContent = adminCount;
    if (userCountEl) userCountEl.textContent = userCount;
}

// Enhanced renderAdminManagement method
renderAdminManagement() {
    if (!this.dom.adminManagementContent) return;

    const filteredAdmins = this.getFilteredAdmins();
    
    // Update statistics
    this.updateAdminStats();

    if (filteredAdmins.length === 0) {
        this.dom.adminManagementContent.innerHTML = `
            <div class="text-center py-12">
                <div class="text-gray-400 mb-4">
                    <i class="fas fa-users-slash text-4xl"></i>
                </div>
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">কোন অ্যাডমিন পাওয়া যায়নি</h3>
                <p class="text-gray-500 dark:text-gray-400 mb-6">নতুন অ্যাডমিন যোগ করুন অথবা সার্চ টার্ম পরিবর্তন করুন</p>
                <button 
                    onclick="smartEvaluator.showAdminModal()"
                    class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                    <i class="fas fa-plus mr-2"></i>
                    প্রথম অ্যাডমিন যোগ করুন
                </button>
            </div>
        `;
        return;
    }

    this.dom.adminManagementContent.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full border-collapse">
                <thead>
                    <tr class="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">ইমেইল</th>
                        <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">টাইপ</th>
                        <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">পারমিশন</th>
                        <th class="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">কার্যক্রম</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-600">
                    ${filteredAdmins.map((admin) => `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td class="p-4">
                                <div class="flex items-center space-x-3">
                                    <div class="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                        <i class="fas fa-user text-blue-600 dark:text-blue-400 text-sm"></i>
                                    </div>
                                    <div>
                                        <div class="font-medium text-gray-900 dark:text-white">${admin.email}</div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">UID: ${admin.id.substring(0, 8)}...</div>
                                    </div>
                                </div>
                            </td>
                            <td class="p-4">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    admin.type === "super-admin"
                                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                        : admin.type === "admin"
                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                        : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                }">
                                    <i class="fas ${
                                        admin.type === "super-admin" ? "fa-crown" :
                                        admin.type === "admin" ? "fa-user-shield" : "fa-user"
                                    } mr-1"></i>
                                    ${
                                        admin.type === "super-admin"
                                            ? "সুপার অ্যাডমিন"
                                            : admin.type === "admin"
                                            ? "সাধারণ অ্যাডমিন"
                                            : "সাধারণ ব্যবহারকারী"
                                    }
                                </span>
                            </td>
                            <td class="p-4">
                                <div class="flex flex-wrap gap-1">
                                    <span class="inline-flex items-center px-2 py-1 rounded text-xs ${
                                        admin.permissions?.read
                                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    }">
                                        <i class="fas fa-eye mr-1"></i>
                                        রিড
                                    </span>
                                    <span class="inline-flex items-center px-2 py-1 rounded text-xs ${
                                        admin.permissions?.write
                                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    }">
                                        <i class="fas fa-plus mr-1"></i>
                                        রাইট
                                    </span>
                                    <span class="inline-flex items-center px-2 py-1 rounded text-xs ${
                                        admin.permissions?.edit
                                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    }">
                                        <i class="fas fa-edit mr-1"></i>
                                        এডিট
                                    </span>
                                    <span class="inline-flex items-center px-2 py-1 rounded text-xs ${
                                        admin.permissions?.delete
                                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    }">
                                        <i class="fas fa-trash mr-1"></i>
                                        ডিলিট
                                    </span>
                                </div>
                            </td>
                            <td class="p-4">
                                <div class="flex space-x-2">
                                    <button 
                                        onclick="smartEvaluator.showAdminModal(${JSON.stringify(admin).replace(/"/g, '&quot;')})"
                                        class="inline-flex items-center px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                    >
                                        <i class="fas fa-edit mr-2"></i>
                                        সম্পাদনা
                                    </button>
                                    ${
                                        admin.id !== this.currentUser?.uid
                                            ? `
                                            <button 
                                                onclick="smartEvaluator.deleteAdmin('${admin.id}')"
                                                class="inline-flex items-center px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                                            >
                                                <i class="fas fa-trash mr-2"></i>
                                                ডিলিট
                                            </button>
                                        `
                                            : `
                                            <span class="inline-flex items-center px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg text-sm cursor-not-allowed">
                                                <i class="fas fa-user-shield mr-2"></i>
                                                নিজের অ্যাকাউন্ট
                                            </span>
                                        `
                                    }
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

    renderAdminManagement() {
        if (!this.dom.adminManagementContent) return;
    
        const filteredAdmins = this.getFilteredAdmins();
    
        this.dom.adminManagementContent.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead>
                        <tr class="bg-gray-100 dark:bg-gray-700">
                            <th class="border border-gray-300 dark:border-gray-600 p-2">ইমেইল</th>
                            <th class="border border-gray-300 dark:border-gray-600 p-2">টাইপ</th>
                            <th class="border border-gray-300 dark:border-gray-600 p-2">পারমিশন</th>
                            <th class="border border-gray-300 dark:border-gray-600 p-2">কার্যক্রম</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredAdmins.map((admin) => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td class="border border-gray-300 dark:border-gray-600 p-2">${admin.email}</td>
                                <td class="border border-gray-300 dark:border-gray-600 p-2">
                                    <span class="px-2 py-1 rounded text-xs ${
                                        admin.type === "super-admin"
                                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                            : admin.type === "admin"
                                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    }">
                                        ${
                                            admin.type === "super-admin"
                                                ? "সুপার অ্যাডমিন"
                                                : admin.type === "admin"
                                                ? "সাধারণ অ্যাডমিন"
                                                : "সাধারণ ব্যবহারকারী"
                                        }
                                    </span>
                                </td>
                                <td class="border border-gray-300 dark:border-gray-600 p-2">
                                    <div class="flex flex-wrap gap-1">
                                        <span class="px-2 py-1 rounded text-xs ${
                                            admin.permissions?.read
                                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                        }">
                                            রিড
                                        </span>
                                        <span class="px-2 py-1 rounded text-xs ${
                                            admin.permissions?.write
                                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                        }">
                                            রাইট
                                        </span>
                                        <span class="px-2 py-1 rounded text-xs ${
                                            admin.permissions?.edit
                                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                        }">
                                            এডিট
                                        </span>
                                        <span class="px-2 py-1 rounded text-xs ${
                                            admin.permissions?.delete
                                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                        }">
                                            ডিলিট
                                        </span>
                                    </div>
                                </td>
                                <td class="border border-gray-300 dark:border-gray-600 p-2">
                                    <div class="flex gap-2">
                                        <button onclick="smartEvaluator.showAdminModal(${JSON.stringify(admin).replace(/"/g, '&quot;')})" 
                                                class="edit-admin-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                                            সম্পাদনা
                                        </button>
                                        ${
                                            admin.id !== this.currentUser?.uid
                                                ? `
                                                <button onclick="smartEvaluator.deleteAdmin('${admin.id}')" 
                                                        class="delete-admin-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                                                    ডিলিট
                                                </button>
                                            `
                                                : ""
                                        }
                                    </div>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async deleteAdmin(id) {
        // Check if current user is super-admin
        if (this.currentUserData?.type !== "super-admin") {
            this.showToast("শুধুমাত্র সুপার অ্যাডমিন অ্যাডমিন ডিলিট করতে পারেন", "error");
            return;
        }

        // Prevent self-deletion
        if (id === this.currentUser.uid) {
            this.showToast("আপনি নিজেকে ডিলিট করতে পারবেন না", "error");
            return;
        }

        this.showDeleteModal("এই অ্যাডমিন ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("admins").doc(id).delete();
                
                // Also delete the user from Firebase Auth (this would require Admin SDK)
                console.log("Admin deleted from Firestore. Note: User still exists in Firebase Auth.");
                
                await this.loadAdmins();
                this.showToast("অ্যাডমিন সফলভাবে ডিলিট করা হয়েছে", "success");
            } catch (error) {
                console.error("Error deleting admin:", error);
                this.showToast("ডিলিট ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        });
    }

    getFilteredAdmins() {
        let admins = this.state.admins;

        if (this.filters.adminSearchTerm) {
            const term = this.filters.adminSearchTerm.toLowerCase();
            admins = admins.filter(
                (admin) =>
                    admin.email.toLowerCase().includes(term) ||
                    admin.type.toLowerCase().includes(term)
            );
        }

        return admins;
    }

    handleAdminSearch(value) {
        this.filters.adminSearchTerm = value.toLowerCase();
        this.renderAdminManagement();
    }

    // ===============================
    // DATA MANAGEMENT
    // ===============================
    async loadInitialData() {
        this.showLoading();
        try {
            await Promise.all([
                this.loadGroups(),
                this.loadStudents(),
                this.loadTasks(),
                this.loadEvaluations(),
            ]);
            
            // Load admins only if super-admin
            if (this.currentUserData?.type === "super-admin") {
                await this.loadAdmins();
            }
            
            this.populateSelects();
            this.renderPolicySections();
        } catch (error) {
            console.error("Initial data load error:", error);
            this.showToast("ডেটা লোড করতে সমস্যা", "error");
        } finally {
            this.hideLoading();
        }
    }

    async loadPublicData() {
        this.showLoading();
        try {
            // Load only public data
            await Promise.all([
                this.loadGroups(),
                this.loadStudents(),
                this.loadTasks(),
                this.loadEvaluations(),
            ]);

            this.populateSelects();
            this.renderPolicySections();

            // Load current page data
            const currentPage = this.getActivePage();
            if (currentPage && this.PUBLIC_PAGES.includes(currentPage)) {
                switch (currentPage) {
                    case "dashboard":
                        await this.loadDashboard();
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
                }
            }
        } catch (error) {
            console.error("Public data load error:", error);
            this.showToast("পাবলিক ডেটা লোড করতে সমস্যা", "error");
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // UTILITY METHODS
    // ===============================
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showLoading(message = "লোড হচ্ছে...") {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.classList.remove("hidden");
            const messageEl = this.dom.loadingOverlay.querySelector("p");
            if (messageEl) messageEl.textContent = message;
        }
    }

    hideLoading() {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.classList.add("hidden");
        }
    }

    showToast(message, type = "success") {
        const toast = this.dom.toast;
        const toastMessage = this.dom.toastMessage;

        if (!toast || !toastMessage) return;

        // Set message and style based on type
        toastMessage.textContent = message;

        // Remove existing classes and add new ones
        toast.className =
            "toast fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition-all duration-300";

        switch (type) {
            case "success":
                toast.classList.add("bg-green-500", "text-white");
                break;
            case "error":
                toast.classList.add("bg-red-500", "text-white");
                break;
            case "warning":
                toast.classList.add("bg-yellow-500", "text-white");
                break;
            case "info":
                toast.classList.add("bg-blue-500", "text-white");
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
    // MODAL MANAGEMENT
    // ===============================
    showLogoutModal() {
        this.showModal(this.dom.logoutModal);
    }

    hideLogoutModal() {
        this.hideModal(this.dom.logoutModal);
    }

    showDeleteModal(text, callback) {
        if (this.dom.deleteModalText) this.dom.deleteModalText.textContent = text;
        this.deleteCallback = callback;
        this.showModal(this.dom.deleteModal);
    }

    hideDeleteModal() {
        this.hideModal(this.dom.deleteModal);
    }

    showEditModal() {
        this.showModal(this.dom.editModal);
    }

    hideEditModal() {
        this.hideModal(this.dom.editModal);
    }

    showModal(modal) {
        if (modal) {
            modal.classList.remove("hidden");
        }
    }

    hideModal(modal) {
        if (modal) {
            modal.classList.add("hidden");
        }
    }

    hideAdminModal() {
        this.hideModal(this.dom.adminModal);
        this.currentEditingAdmin = null;
    }

    // ===============================
    // THEME MANAGEMENT - FIXED
    // ===============================
    toggleTheme() {
        const isDark = document.documentElement.classList.contains("dark");
        const themeIcon = this.dom.themeToggle.querySelector('i');
        
        if (isDark) {
            document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", "light");
            if (themeIcon) {
                themeIcon.className = "fas fa-moon";
            }
        } else {
            document.documentElement.classList.add("dark");
            localStorage.setItem("theme", "dark");
            if (themeIcon) {
                themeIcon.className = "fas fa-sun";
            }
        }
    }

    applySavedTheme() {
        const savedTheme = localStorage.getItem("theme");
        const themeIcon = this.dom.themeToggle?.querySelector('i');
        
        if (savedTheme === "dark") {
            document.documentElement.classList.add("dark");
            if (themeIcon) {
                themeIcon.className = "fas fa-sun";
            }
        } else {
            document.documentElement.classList.remove("dark");
            if (themeIcon) {
                themeIcon.className = "fas fa-moon";
            }
        }
    }

    ensurePublicPage() {
        const currentPage = this.getActivePage();
        console.log("Current active page:", currentPage);

        // If current page is private and user is not logged in, redirect to dashboard
        if (this.PRIVATE_PAGES.includes(currentPage) && !this.currentUser) {
            console.log("Redirecting from private page to dashboard");
            this.showPage("dashboard");
        }
    }

    getActivePage() {
        let activePage = "dashboard"; // default
        this.dom.navBtns.forEach((btn) => {
            if (btn.classList.contains("active")) {
                activePage = btn.getAttribute("data-page");
            }
        });
        return activePage;
    }

    // ===============================
    // DATA LOADING METHODS
    // ===============================
    async loadGroups() {
        try {
            const cacheKey = "groups_data";
            const cached = this.cache.get(cacheKey);

            if (!cached) {
                const snap = await db.collection("groups").orderBy("name").get();
                this.state.groups = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                this.cache.set(cacheKey, this.state.groups);
            } else {
                this.state.groups = cached;
            }

            this.renderGroups();
        } catch (error) {
            console.error("Error loading groups:", error);
            this.showToast("গ্রুপ লোড করতে সমস্যা", "error");
        }
    }

    async loadStudents() {
        try {
            const cacheKey = "students_data";
            const cached = this.cache.get(cacheKey);

            if (!cached) {
                const snap = await db.collection("students").orderBy("name").get();
                this.state.students = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                this.cache.set(cacheKey, this.state.students);
            } else {
                this.state.students = cached;
            }

            this.renderStudentsList();
            this.renderStudentCards();
        } catch (error) {
            console.error("Error loading students:", error);
            this.showToast("শিক্ষার্থী লোড করতে সমস্যা", "error");
        }
    }

    async loadTasks() {
        try {
            const cacheKey = "tasks_data";
            const cached = this.cache.get(cacheKey);

            if (!cached) {
                const snap = await db.collection("tasks").orderBy("date", "desc").get();
                this.state.tasks = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                this.cache.set(cacheKey, this.state.tasks);
            } else {
                this.state.tasks = cached;
            }

            this.renderTasks();
        } catch (error) {
            console.error("Error loading tasks:", error);
            this.showToast("টাস্ক লোড করতে সমস্যা", "error");
        }
    }

    async loadEvaluations() {
        try {
            const cacheKey = "evaluations_data";
            const cached = this.cache.get(cacheKey);

            if (!cached) {
                const snap = await db.collection("evaluations").get();
                this.state.evaluations = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                this.cache.set(cacheKey, this.state.evaluations);
            } else {
                this.state.evaluations = cached;
            }

            this.calculateProblemSolvingStats();
            this.renderEvaluationList();
        } catch (error) {
            console.error("Error loading evaluations:", error);
            this.showToast("মূল্যায়ন লোড করতে সমস্যা", "error");
        }
    }

    // ===============================
    // RENDERING METHODS
    // ===============================
    renderGroups() {
        if (!this.dom.groupsList) return;
    
        const memberCountMap = this.computeMemberCountMap();
    
        this.dom.groupsList.innerHTML = this.state.groups
            .map(
                (group) => `
                    <div class="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div>
                            <div class="font-medium">${group.name}</div>
                            <div class="text-sm text-gray-500">সদস্য: ${
                                memberCountMap[group.id] || 0
                            } জন</div>
                        </div>
                        <div class="flex gap-2">
                            ${
                                this.canEdit()
                                    ? `<button onclick="smartEvaluator.editGroup('${group.id}')" class="edit-group-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>`
                                    : ""
                            }
                            ${
                                this.canDelete()
                                    ? `<button onclick="smartEvaluator.deleteGroup('${group.id}')" class="delete-group-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>`
                                    : ""
                            }
                            ${
                                !this.canEdit() && !this.canDelete()
                                    ? '<span class="text-sm text-gray-500">এডিট/ডিলিট করার পারমিশন নেই</span>'
                                    : ""
                            }
                        </div>
                    </div>
                `
            )
            .join("");
    }
    renderStudentsList() {
        if (!this.dom.studentsList) return;
    
        const filteredStudents = this.getFilteredStudents();
    
        this.dom.studentsList.innerHTML = filteredStudents
            .map((student) => {
                const group = this.state.groups.find((g) => g.id === student.groupId);
                const roleBadge = student.role
                    ? `<span class="member-role-badge ${student.role}">${
                        this.roleNames[student.role] || student.role
                    }</span>`
                    : "";
                return `
                    <div class="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div>
                            <div class="font-medium">${
                                student.name
                            } ${roleBadge}</div>
                            <div class="text-sm text-gray-500">রোল: ${
                                student.roll
                            } | জেন্ডার:${student.gender} | গ্রুপ: ${
                        group?.name ||"নাই"
                    }</div>
                        </div>
                        <div class="flex gap-2">
                            ${
                                this.canEdit()
                                    ? `<button onclick="smartEvaluator.editStudent('${student.id}')" class="edit-student-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>`
                                    : ""
                            }
                            ${
                                this.canDelete()
                                    ? `<button onclick="smartEvaluator.deleteStudent('${student.id}')" class="delete-student-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>`
                                    : ""
                            }
                            ${
                                !this.canEdit() && !this.canDelete()
                                    ? '<span class="text-sm text-gray-500">এডিট/ডিলিট করার পারমিশন নেই</span>'
                                    : ""
                            }
                        </div>
                    </div>
                `;
            })
            .join("");
    }
    renderStudentCards() {
        if (!this.dom.allStudentsCards) return;
    
        const filteredStudents = this.getFilteredStudents("cards");
    
        this.dom.allStudentsCards.innerHTML = filteredStudents
            .map((student, index) => {
                const group = this.state.groups.find((g) => g.id === student.groupId);
    
                // Same group → same bg color class
                const groupColorIndex = group ? (this.state.groups.indexOf(group) % 6) + 1 : 1;
                const bgClass = `student-group-color-${groupColorIndex}`;
    
                const roleBadge = student.role
                    ? `<span class="member-role-badge ${student.role}">
                            ${this.roleNames[student.role] || student.role}
                       </span>`
                    : `<span class="px-2 py-1 text-xs rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">দায়িত্ব বাকি</span>`;
    
                return `
                    <div class="student-card ${bgClass} relative rounded-2xl p-5 shadow-lg border border-gray-200 dark:border-gray-700 transition-transform hover:-translate-y-1 hover:shadow-xl">
                        
                        <!-- Serial Number -->
                        <span class="serial-number absolute bottom-3 right-4 text-5xl font-extrabold text-gray-200 dark:text-gray-700 opacity-40 select-none">
                            ${index + 1}
                        </span>
    
                        <!-- Avatar + Name -->
                        <div class="flex items-start mb-4 relative z-10">
                            
                            <div class="flex-1">
                                <h3 class="font-bold text-lg text-gray-900 dark:text-gray-100 text-center">${student.name}</h3>
                                <div class="mt-1 text-center">${roleBadge}</div>
                            </div>
                        </div>
    
                        <!-- Info Section -->
                        <div class="grid grid-cols-1 gap-2 text-sm text-gray-800 dark:text-gray-300 relative z-10">
                            <p><i class="fas fa-id-card mr-2 text-indigo-500"></i> রোল: ${student.roll}</p>
                            <p><i class="fas fa-venus-mars mr-2 text-pink-500"></i> জেন্ডার:${student.gender}</p>
                            <p><i class="fas fa-users mr-2 text-green-500"></i> গ্রুপ: ${group?.name ||"নাই"}</p>
                            <p><i class="fas fa-book mr-2 text-orange-500"></i> একাডেমিক: ${student.academicGroup ||"নাই"}</p>
                            <p><i class="fas fa-calendar mr-2 text-blue-500"></i> সেশন: ${student.session ||"নাই"}</p>
                            ${
                                student.contact
                                    ? `<p><i class="fas fa-envelope mr-2 text-red-500"></i> ${student.contact}</p>`
                                    : ""
                            }
                        </div>
                    </div>
                `;
            })
            .join("");
    }
    
    renderTasks() {
        if (!this.dom.tasksList) return;

        this.dom.tasksList.innerHTML = this.state.tasks
            .map((task) => {
                const dateStr = task.date?.seconds
                    ? new Date(task.date.seconds * 1000).toLocaleDateString("bn-BD")
                    : "তারিখ নেই";

                return `
                    <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div class="p-4 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                            <div>
                                <h3 class="font-semibold text-gray-800 dark:text-white">${task.name}</h3>
                                <p class="text-sm text-gray-500">তারিখ: ${dateStr} | সর্বোচ্চ স্কোর: ${
                    task.maxScore
                }</p>
                            </div>
                            <div class="flex gap-2">
                                ${
                                    this.currentUser
                                        ? `
                                    <button onclick="smartEvaluator.editTask('${task.id}')" class="edit-task-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                                    <button onclick="smartEvaluator.deleteTask('${task.id}')" class="delete-task-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                                `
                                        : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'
                                }
                            </div>
                        </div>
                        <div class="p-4">
                            <p class="text-gray-600 dark:text-gray-300">${
                                task.description || "কোন বিবরণ নেই"
                            }</p>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    renderEvaluationList() {
        if (!this.dom.evaluationListTable) return;

        this.dom.evaluationListTable.innerHTML = this.state.evaluations
            .map((evaluation) => {
                const task = this.state.tasks.find((t) => t.id === evaluation.taskId);
                const group = this.state.groups.find(
                    (g) => g.id === evaluation.groupId
                );
                const totalScore = this.calculateEvaluationTotalScore(evaluation);
                const dateStr = evaluation.updatedAt?.seconds
                    ? new Date(evaluation.updatedAt.seconds * 1000).toLocaleDateString(
                        "bn-BD"
                    )
                    : "তারিখ নেই";

                return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td class="border border-gray-300 dark:border-gray-600 p-2">${
                            task?.name || "Unknown Task"
                        }</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-2">${
                            group?.name || "Unknown Group"
                        }</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-2">${dateStr}</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-2 font-semibold">${totalScore}</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-2">
                            <div class="flex gap-2">
                                <button onclick="smartEvaluator.editEvaluation('${
                                    evaluation.id
                                }')" class="edit-evaluation-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                                ${
                                    this.currentUser?.type === "super-admin"
                                        ? `
                                    <button onclick="smartEvaluator.deleteEvaluation('${evaluation.id}')" class="delete-evaluation-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                                `
                                        : ""
                                }
                            </div>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    renderPolicySections() {
        if (!this.dom.policySections) return;

        this.dom.policySections.innerHTML = this.policySections
            .map(
                (section, index) => `
                <div class="policy-section border border-gray-200 dark:border-gray-700 rounded-lg mb-4 overflow-hidden">
                    <div class="policy-header bg-gray-50 dark:bg-gray-800 p-4 flex justify-between items-center cursor-pointer" onclick="smartEvaluator.togglePolicySection(${index})">
                        <h4 class="font-semibold text-gray-800 dark:text-white">${section.title}</h4>
                        <i class="fas fa-chevron-down transform transition-transform" id="policyIcon-${index}"></i>
                    </div>
                    <div class="policy-content hidden p-4 bg-white dark:bg-gray-900" id="policyContent-${index}">
                        <div class="whitespace-pre-line text-gray-700 dark:text-gray-300">${section.content}</div>
                    </div>
                </div>
            `
            )
            .join("");
    }




    // ===============================
    // GROUP DETAILS WITH ENHANCED ANALYSIS - FIXED
    // ===============================
    renderGroupDetails(groupId) {
        if (!this.dom.groupDetailsContent) return;

        const group = this.state.groups.find((g) => g.id === groupId);
        const groupStudents = this.state.students.filter(
            (s) => s.groupId === groupId
        );
        const groupEvaluations = this.state.evaluations.filter(
            (e) => e.groupId === groupId
        );

        let content = `
            <div class="mb-6">
                
                <!-- Summary Section -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <div class="text-blue-600 dark:text-blue-400 font-semibold text-center">মোট মূল্যায়ন</div>
                        <div class="text-2xl font-bold text-blue-700 dark:text-blue-300 text-center">${groupEvaluations.length}</div>
                    </div>
                    <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                        <div class="text-green-600 dark:text-green-400 font-semibold text-center">সদস্য সংখ্যা</div>
                        <div class="text-2xl font-bold text-green-700 dark:text-green-300 text-center">${groupStudents.length}</div>
                    </div>
                    <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                        <div class="text-purple-600 dark:text-purple-400 font-semibold text-center">গড় স্কোর</div>
                        <div class="text-2xl font-bold text-purple-700 dark:text-purple-300 text-center">${this.calculateGroupAverageScore(groupId).toFixed(2)}</div>
                    </div>
                </div>
            </div>
        `;

        if (groupEvaluations.length === 0) {
            content += `<p class="text-gray-500 text-center py-8">কোন মূল্যায়ন পাওয়া যায়নি</p>`;
        } else {
            groupEvaluations.forEach((evalItem) => {
                const task = this.state.tasks.find((t) => t.id === evalItem.taskId);
                const evalStats = this.calculateEvaluationStats(evalItem);
                
                content += `
                    <div class="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                        <!-- Evaluation Summary -->
                        <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <h5 class="font-semibold text-lg mb-2 text-gray-800 dark:text-white">${task?.name || "Unknown Task"}</h5>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <div class="text-gray-600 dark:text-gray-400">গড় স্কোর</div>
                                    <div class="font-semibold text-blue-600 dark:text-blue-400">${evalStats.averageScore.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div class="text-gray-600 dark:text-gray-400">সর্বোচ্চ স্কোর</div>
                                    <div class="font-semibold text-green-600 dark:text-green-400">${evalStats.maxScore}</div>
                                </div>
                                <div>
                                    <div class="text-gray-600 dark:text-gray-400">ন্যূনতম স্কোর</div>
                                    <div class="font-semibold text-red-600 dark:text-red-400">${evalStats.minScore}</div>
                                </div>
                                <div>
                                    <div class="text-gray-600 dark:text-gray-400">মোট যোগফল</div>
                                    <div class="font-semibold text-purple-600 dark:text-purple-400">${evalStats.totalScore}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Detailed Table -->
                        <div class="overflow-auto">
                            <table class="evaluation-table w-full border-collapse">
                                <thead>
                                    <tr class="bg-gray-100 dark:bg-gray-700">
                                        <th class="border border-gray-300 dark:border-gray-600 p-3 text-left text-gray-800 dark:text-white">শিক্ষার্থী</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-3 text-left text-gray-800 dark:text-white">টাস্ক স্কোর</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-3 text-left text-gray-800 dark:text-white">টিমওয়ার্ক</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-3 text-left text-gray-800 dark:text-white">অতিরিক্ত পয়েন্ট</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-3 text-left text-gray-800 dark:text-white">মোট</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-3 text-left text-gray-800 dark:text-white">মন্তব্য</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                groupStudents.forEach((student) => {
                    const score = evalItem.scores?.[student.id] || {};
                    const optionMarks = score.optionMarks || {};
                    let additionalMarks = 0;
                    let optionDetails = [];

                    Object.values(optionMarks).forEach((opt) => {
                        if (opt.selected) {
                            const optDef = this.evaluationOptions.find(
                                (o) => o.id === opt.optionId
                            );
                            if (optDef) {
                                additionalMarks += optDef.marks;
                                optionDetails.push(optDef.text);
                            }
                        }
                    });

                    const total =
                        (score.taskScore || 0) +
                        (score.teamworkScore || 0) +
                        additionalMarks;

                    content += `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${student.name}${
                        student.role ? ` (${this.roleNames[student.role]})` : ""
                    }</td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${score.taskScore || 0}</td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${score.teamworkScore || 0}</td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${additionalMarks}</td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-3 font-semibold text-blue-600 dark:text-blue-400">${total}</td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${score.comments || "-"}</td>
                                </tr>
                            `;
                });

                content += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }

        this.dom.groupDetailsContent.innerHTML = content;
    }

    // ===============================
    // CALCULATION METHODS - FIXED
    // ===============================
    calculateGroupAverageScore(groupId) {
        const groupEvaluations = this.state.evaluations.filter(
            (e) => e.groupId === groupId
        );
        
        if (groupEvaluations.length === 0) return 0;

        let totalScore = 0;
        let evaluationCount = 0;

        groupEvaluations.forEach((evalItem) => {
            if (evalItem.scores) {
                Object.values(evalItem.scores).forEach((score) => {
                    let additionalMarks = 0;
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach((opt) => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(
                                    (o) => o.id === opt.optionId
                                );
                                if (optDef) additionalMarks += optDef.marks;
                            }
                        });
                    }

                    totalScore +=
                        (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                    evaluationCount++;
                });
            }
        });

        return evaluationCount > 0 ? totalScore / evaluationCount : 0;
    }

    calculateEvaluationStats(evaluation) {
        const stats = {
            totalScore: 0,
            averageScore: 0,
            maxScore: 0,
            minScore: Infinity,
            studentCount: 0
        };

        if (evaluation.scores) {
            Object.values(evaluation.scores).forEach((score) => {
                let additionalMarks = 0;
                if (score.optionMarks) {
                    Object.values(score.optionMarks).forEach((opt) => {
                        if (opt.selected) {
                            const optDef = this.evaluationOptions.find(
                                (o) => o.id === opt.optionId
                            );
                            if (optDef) additionalMarks += optDef.marks;
                        }
                    });
                }

                const studentTotal =
                    (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                
                stats.totalScore += studentTotal;
                stats.maxScore = Math.max(stats.maxScore, studentTotal);
                stats.minScore = Math.min(stats.minScore, studentTotal);
                stats.studentCount++;
            });

            stats.averageScore = stats.studentCount > 0 ? stats.totalScore / stats.studentCount : 0;
            stats.minScore = stats.minScore === Infinity ? 0 : stats.minScore;
        }

        return stats;
    }

    calculateEvaluationTotalScore(evaluation) {
        if (!evaluation.scores) return 0;

        let total = 0;
        Object.values(evaluation.scores).forEach((score) => {
            let additionalMarks = 0;
            if (score.optionMarks) {
                Object.values(score.optionMarks).forEach((opt) => {
                    if (opt.selected) {
                        const optDef = this.evaluationOptions.find(
                            (o) => o.id === opt.optionId
                        );
                        if (optDef) additionalMarks += optDef.marks;
                    }
                });
            }

            total +=
                (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
        });

        return total;
    }

    calculateProblemSolvingStats() {
        const stats = {
            totalProblems: 0,
            cannotDo: 0,
            learnedCannotWrite: 0,
            learnedCanWrite: 0,
            weeklyHomework: 0,
            weeklyAttendance: 0,
        };

        this.state.evaluations.forEach((evalItem) => {
            if (!evalItem.scores) return;
            Object.values(evalItem.scores).forEach((score) => {
                stats.totalProblems++;
                if (score.optionMarks) {
                    Object.values(score.optionMarks).forEach((opt) => {
                        if (opt.selected) {
                            switch (opt.optionId) {
                                case "cannot_do":
                                    stats.cannotDo++;
                                    break;
                                case "learned_cannot_write":
                                    stats.learnedCannotWrite++;
                                    break;
                                case "learned_can_write":
                                    stats.learnedCanWrite++;
                                    break;
                                case "weekly_homework":
                                    stats.weeklyHomework++;
                                    break;
                                case "weekly_attendance":
                                    stats.weeklyAttendance++;
                                    break;
                            }
                        }
                    });
                }
            });
        });

        this.state.problemStats = stats;
    }



    // ===============================
// ENHANCED CSV IMPORT/EXPORT WITH BENGALI SUPPORT
// ===============================

async processCSVImportWithBengali() {
    if (!this.csvImportData || this.csvImportData.length === 0) {
        this.showToast("প্রথমে CSV ফাইল নির্বাচন করুন", "error");
        return;
    }

    this.showLoading("শিক্ষার্থী ডেটা ইমপোর্ট হচ্ছে...");
    try {
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const [index, studentData] of this.csvImportData.entries()) {
            try {
                // Validate required fields
                if (!studentData.name || !studentData.roll || !studentData.gender || !studentData.academicGroup || !studentData.session) {
                    errors.push(`সারি ${index + 2}: প্রয়োজনীয় ফিল্ড খালি`);
                    errorCount++;
                    continue;
                }

                // Check uniqueness
                const isDuplicate = await this.checkStudentUniqueness(
                    studentData.roll,
                    studentData.academicGroup
                );
                if (isDuplicate) {
                    errors.push(`সারি ${index + 2}: এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী ইতিমধ্যে আছে`);
                    errorCount++;
                    continue;
                }

                await db.collection("students").add({
                    name: studentData.name,
                    roll: studentData.roll,
                    gender: studentData.gender,
                    groupId: studentData.groupId || "",
                    contact: studentData.contact || "",
                    academicGroup: studentData.academicGroup,
                    session: studentData.session,
                    role: studentData.role || "",
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                successCount++;
            } catch (error) {
                errors.push(`সারি ${index + 2}: ${error.message}`);
                errorCount++;
                console.error("Error importing student:", error);
            }
        }

        // Clear cache and reload data
        this.cache.clear("students_data");
        await this.loadStudents();

        this.csvImportData = null;
        if (this.dom.csvFileInput) this.dom.csvFileInput.value = "";
        if (this.dom.csvFileName) this.dom.csvFileName.textContent = "";

        // Show detailed results
        if (errors.length > 0) {
            this.showImportResults(successCount, errorCount, errors);
        } else {
            this.showToast(
                `ইমপোর্ট সম্পন্ন: ${successCount} টি ডেটা সফলভাবে যোগ করা হয়েছে`,
                "success"
            );
        }
    } catch (error) {
        this.showToast("ইমপোর্ট ব্যর্থ: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

showImportResults(successCount, errorCount, errors) {
    const resultsHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white">ইমপোর্ট ফলাফল</h3>
                <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                        <div class="text-green-600 dark:text-green-400 font-semibold">সফল</div>
                        <div class="text-2xl font-bold text-green-700 dark:text-green-300">${successCount}</div>
                    </div>
                    <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                        <div class="text-red-600 dark:text-red-400 font-semibold">ত্রুটিপূর্ণ</div>
                        <div class="text-2xl font-bold text-red-700 dark:text-red-300">${errorCount}</div>
                    </div>
                </div>
                ${errors.length > 0 ? `
                    <div>
                        <h4 class="font-semibold mb-2 text-gray-700 dark:text-gray-300">ত্রুটি বিবরণ:</h4>
                        <div class="bg-red-50 dark:bg-red-900/10 p-4 rounded-lg max-h-60 overflow-y-auto">
                            ${errors.map(error => `<p class="text-sm text-red-600 dark:text-red-400 mb-1">• ${error}</p>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = resultsHTML;
    document.body.appendChild(modal);
}

async exportStudentsCSVWithBengali() {
    this.showLoading("শিক্ষার্থী ডেটা এক্সপোর্ট হচ্ছে...");
    try {
        const headers = ["নাম", "রোল", "লিঙ্গ", "গ্রুপ", "যোগাযোগ", "একাডেমিক গ্রুপ", "সেশন", "দায়িত্ব"];
        const csvData = this.state.students.map((student) => {
            const group = this.state.groups.find((g) => g.id === student.groupId);
            return [
                student.name,
                student.roll,
                student.gender,
                group?.name || "",
                student.contact || "",
                student.academicGroup || "",
                student.session || "",
                this.roleNames[student.role] || student.role || "",
            ];
        });

        // Add BOM for UTF-8 to support Bengali
        const BOM = "\uFEFF";
        const csvContent = BOM + [headers, ...csvData]
            .map((row) => row.map((cell) => `"${cell}"`).join(","))
            .join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        this.downloadBlob(blob, "শিক্ষার্থী_তালিকা.csv");
        this.showToast("শিক্ষার্থী ডেটা CSV হিসেবে এক্সপোর্ট成功", "success");
    } catch (error) {
        this.showToast("এক্সপোর্ট ব্যর্থ: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}


// ===============================
// ENHANCED EXPORT FUNCTIONALITY
// ===============================

async exportAllDataAsZip() {
    this.showLoading("সমস্ত ডেটা ZIP ফাইলে এক্সপোর্ট হচ্ছে...");
    try {
        const JSZip = window.JSZip;
        if (!JSZip) {
            this.showToast("ZIP লাইব্রেরি লোড করা যায়নি", "error");
            return;
        }

        const zip = new JSZip();

        // Add students CSV
        const studentsCSV = await this.generateStudentsCSV();
        zip.file("students.csv", studentsCSV);

        // Add groups CSV
        const groupsCSV = await this.generateGroupsCSV();
        zip.file("groups.csv", groupsCSV);

        // Add evaluations CSV
        const evaluationsCSV = await this.generateEvaluationsCSV();
        zip.file("evaluations.csv", evaluationsCSV);

        // Add tasks CSV
        const tasksCSV = await this.generateTasksCSV();
        zip.file("tasks.csv", tasksCSV);

        // Add all data as JSON
        const allData = {
            exportDate: new Date().toISOString(),
            groups: this.state.groups,
            students: this.state.students,
            tasks: this.state.tasks,
            evaluations: this.state.evaluations,
        };
        zip.file("all_data.json", JSON.stringify(allData, null, 2));

        // Generate PDF summary
        const pdfBlob = await this.generateSummaryPDF();
        zip.file("summary.pdf", pdfBlob);

        // Generate the zip file
        const content = await zip.generateAsync({ type: "blob" });
        this.downloadBlob(content, `smart_evaluator_data_${new Date().toISOString().split('T')[0]}.zip`);
        
        this.showToast("সমস্ত ডেটা ZIP ফাইলে সফলভাবে এক্সপোর্ট করা হয়েছে", "success");
    } catch (error) {
        this.showToast("ZIP এক্সপোর্ট ব্যর্থ: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

async generateSummaryPDF() {
    return new Promise((resolve) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Add title
        doc.setFontSize(20);
        doc.setTextColor(40, 40, 40);
        doc.text("Smart Evaluator - ডেটা সামারি", 105, 20, { align: "center" });

        // Add export date
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`এক্সপোর্ট তারিখ: ${new Date().toLocaleDateString('bn-BD')}`, 105, 30, { align: "center" });

        let yPosition = 50;

        // Summary statistics
        doc.setFontSize(16);
        doc.setTextColor(40, 40, 40);
        doc.text("সারসংক্ষেপ", 20, yPosition);
        yPosition += 10;

        doc.setFontSize(12);
        const stats = [
            `মোট গ্রুপ: ${this.state.groups.length}`,
            `মোট শিক্ষার্থী: ${this.state.students.length}`,
            `মোট টাস্ক: ${this.state.tasks.length}`,
            `মোট মূল্যায়ন: ${this.state.evaluations.length}`,
        ];

        stats.forEach(stat => {
            doc.text(stat, 30, yPosition);
            yPosition += 8;
        });

        yPosition += 10;

        // Group-wise summary
        if (this.state.groups.length > 0) {
            doc.setFontSize(14);
            doc.text("গ্রুপ অনুযায়ী সারসংক্ষেপ", 20, yPosition);
            yPosition += 10;

            doc.setFontSize(10);
            this.state.groups.forEach((group, index) => {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }

                const groupStudents = this.state.students.filter(s => s.groupId === group.id);
                const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
                
                doc.text(`${index + 1}. ${group.name}`, 25, yPosition);
                doc.text(`সদস্য: ${groupStudents.length} জন, মূল্যায়ন: ${groupEvaluations.length} টি`, 35, yPosition + 5);
                yPosition += 12;
            });
        }

        // Generate blob
        const pdfBlob = doc.output("blob");
        resolve(pdfBlob);
    });
}

async exportGroupAnalysisPDF() {
    this.showLoading("গ্রুপ বিশ্লেষণ PDF তৈরি হচ্ছে...");
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Add title
        doc.setFontSize(18);
        doc.text("গ্রুপ বিশ্লেষণ রিপোর্ট", 105, 20, { align: "center" });

        // Add date
        doc.setFontSize(12);
        doc.text(`রিপোর্ট তারিখ: ${new Date().toLocaleDateString('bn-BD')}`, 105, 30, { align: "center" });

        let yPosition = 50;

        // Group performance summary
        this.state.groups.forEach((group, index) => {
            if (yPosition > 270) {
                doc.addPage();
                yPosition = 20;
            }

            const groupStudents = this.state.students.filter(s => s.groupId === group.id);
            const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
            const averageScore = this.calculateGroupAverageScore(group.id);

            doc.setFontSize(14);
            doc.text(`${index + 1}. ${group.name}`, 20, yPosition);
            yPosition += 8;

            doc.setFontSize(10);
            doc.text(`সদস্য সংখ্যা: ${groupStudents.length} জন`, 25, yPosition);
            yPosition += 6;
            doc.text(`মোট মূল্যায়ন: ${groupEvaluations.length} টি`, 25, yPosition);
            yPosition += 6;
            doc.text(`গড় স্কোর: ${averageScore.toFixed(2)}`, 25, yPosition);
            yPosition += 10;
        });

        // Save the PDF
        doc.save(`group_analysis_${new Date().toISOString().split('T')[0]}.pdf`);
        this.showToast("গ্রুপ বিশ্লেষণ PDF সফলভাবে তৈরি করা হয়েছে", "success");
    } catch (error) {
        this.showToast("PDF তৈরি করতে সমস্যা: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}


// ===============================
// GROUP ANALYSIS PDF GENERATION - A4 SIZE WITH BENGALI SUPPORT
// ===============================

async generateGroupAnalysisPDF(groupId = null) {
    this.showLoading("PDF রিপোর্ট তৈরি হচ্ছে...");
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        // Set Bengali font (using default font that supports basic Bengali)
        doc.setFont('helvetica');
        
        // Page dimensions
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let yPosition = margin;

        // Header Section
        yPosition = this.addPDFHeader(doc, yPosition, pageWidth, margin);
        
        // Group Selection Logic
        let groupsToProcess = [];
        if (groupId) {
            const group = this.state.groups.find(g => g.id === groupId);
            if (group) groupsToProcess.push(group);
        } else {
            // Process all groups with evaluations
            groupsToProcess = this.state.groups.filter(group => {
                const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
                return groupEvaluations.length > 0;
            });
        }

        if (groupsToProcess.length === 0) {
            this.showToast("PDF তৈরি করার জন্য কোন ডেটা পাওয়া যায়নি", "error");
            this.hideLoading();
            return;
        }

        // Process each group
        for (let i = 0; i < groupsToProcess.length; i++) {
            const group = groupsToProcess[i];
            
            // Check if we need a new page
            if (yPosition > pageHeight - 50) {
                doc.addPage();
                yPosition = margin;
                yPosition = this.addPDFHeader(doc, yPosition, pageWidth, margin, true);
            }

            // Add group section
            yPosition = await this.addGroupAnalysisToPDF(doc, group, yPosition, pageWidth, margin, pageHeight);
            
            // Add page break if not last group
            if (i < groupsToProcess.length - 1) {
                doc.addPage();
                yPosition = margin;
                yPosition = this.addPDFHeader(doc, yPosition, pageWidth, margin, true);
            }
        }

        // Save the PDF
        const fileName = groupId 
            ? `group_analysis_${this.state.groups.find(g => g.id === groupId)?.name || 'single'}_${new Date().toISOString().split('T')[0]}.pdf`
            : `complete_group_analysis_${new Date().toISOString().split('T')[0]}.pdf`;
        
        doc.save(fileName);
        this.showToast("PDF রিপোর্ট সফলভাবে তৈরি করা হয়েছে", "success");
        
    } catch (error) {
        console.error("PDF generation error:", error);
        this.showToast("PDF তৈরি করতে সমস্যা: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

addPDFHeader(doc, yPosition, pageWidth, margin, isContinued = false) {
    // Title
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text("গ্রুপ বিশ্লেষণ রিপোর্ট", pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    // Subtitle
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    const subtitle = isContinued ? "রিপোর্টের ধারাবাহিকতা" : "স্মার্ট ইভ্যালুয়েটর সিস্টেম";
    doc.text(subtitle, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 8;

    // Date and Info
    doc.setFontSize(10);
    doc.text(`প্রস্তুতকৃত: ${new Date().toLocaleDateString('bn-BD')}`, margin, yPosition);
    doc.text(`পৃষ্ঠা: ${doc.internal.getNumberOfPages()}`, pageWidth - margin, yPosition, { align: 'right' });
    yPosition += 15;

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    return yPosition;
}

async addGroupAnalysisToPDF(doc, group, yPosition, pageWidth, margin, pageHeight) {
    const groupStudents = this.state.students.filter(s => s.groupId === group.id);
    const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
    const stats = this.calculateGroupComprehensiveStats(group.id, groupStudents, groupEvaluations);

    // Group Header
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(`গ্রুপ: ${group.name}`, margin, yPosition);
    yPosition += 8;

    // Group Summary Cards
    yPosition = this.addSummaryCardsToPDF(doc, stats, yPosition, pageWidth, margin);
    yPosition += 10;

    // Student Performance Table
    if (stats.studentPerformance.length > 0) {
        yPosition = this.addStudentPerformanceTableToPDF(doc, stats.studentPerformance, yPosition, pageWidth, margin, pageHeight);
        yPosition += 10;
    }

    // Task Performance Section
    if (stats.taskPerformance.length > 0) {
        yPosition = this.addTaskPerformanceToPDF(doc, stats.taskPerformance, yPosition, pageWidth, margin, pageHeight);
        yPosition += 10;
    }

    // Role-wise Performance
    if (stats.rolePerformance.length > 0) {
        yPosition = this.addRolePerformanceToPDF(doc, stats.rolePerformance, yPosition, pageWidth, margin);
    }

    return yPosition;
}

addSummaryCardsToPDF(doc, stats, yPosition, pageWidth, margin) {
    const cardWidth = (pageWidth - 2 * margin - 20) / 4;
    const cardHeight = 25;
    const cards = [
        { title: "সদস্য সংখ্যা", value: stats.memberCount, color: [59, 130, 246] },
        { title: "মূল্যায়ন", value: stats.evaluationCount, color: [16, 185, 129] },
        { title: "গড় স্কোর", value: stats.overallAverage.toFixed(2), color: [139, 92, 246] },
        { title: "সর্বোচ্চ স্কোর", value: stats.maxScore.toFixed(2), color: [245, 158, 11] }
    ];

    cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + 5);
        
        // Card background
        doc.setFillColor(...card.color, 0.1);
        doc.roundedRect(x, yPosition, cardWidth, cardHeight, 3, 3, 'F');
        
        // Border
        doc.setDrawColor(...card.color);
        doc.roundedRect(x, yPosition, cardWidth, cardHeight, 3, 3);
        
        // Content
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(card.title, x + 5, yPosition + 7);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...card.color);
        doc.text(card.value.toString(), x + 5, yPosition + 16);
    });

    return yPosition + cardHeight + 5;
}

addStudentPerformanceTableToPDF(doc, studentPerformance, yPosition, pageWidth, margin, pageHeight) {
    // Table Header
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 12, 'F');
    
    const columns = [
        { header: "শিক্ষার্থীর নাম", width: 60 },
        { header: "দায়িত্ব", width: 40 },
        { header: "গড় স্কোর", width: 30 },
        { header: "মূল্যায়ন", width: 30 },
        { header: "স্ট্যাটাস", width: 30 }
    ];

    // Header row
    let x = margin + 2;
    columns.forEach(col => {
        doc.text(col.header, x, yPosition + 8);
        x += col.width;
    });

    yPosition += 12;

    // Student rows
    doc.setFontSize(10);
    studentPerformance.forEach((student, index) => {
        // Check for page break
        if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = margin;
            // Add table header again
            doc.setFont(undefined, 'bold');
            doc.setTextColor(255, 255, 255);
            doc.setFillColor(59, 130, 246);
            doc.rect(margin, yPosition, pageWidth - 2 * margin, 12, 'F');
            
            x = margin + 2;
            columns.forEach(col => {
                doc.text(col.header, x, yPosition + 8);
                x += col.width;
            });
            yPosition += 12;
        }

        // Alternate row background
        if (index % 2 === 0) {
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, yPosition, pageWidth - 2 * margin, 10, 'F');
        }

        // Student data
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        
        x = margin + 2;
        doc.text(this.truncateText(student.name, 20), x, yPosition + 7);
        x += columns[0].width;
        
        doc.text(this.truncateText(student.roleName, 15), x, yPosition + 7);
        x += columns[1].width;
        
        doc.text(student.averageScore.toFixed(2), x, yPosition + 7);
        x += columns[2].width;
        
        doc.text(student.evaluationCount.toString(), x, yPosition + 7);
        x += columns[3].width;
        
        // Status with color coding
        const status = student.averageScore >= 80 ? "Excellent" : 
                      student.averageScore >= 60 ? "Good" : "Needs Improvement";
        const statusColor = student.averageScore >= 80 ? [34, 197, 94] : 
                           student.averageScore >= 60 ? [234, 179, 8] : [239, 68, 68];
        
        doc.setTextColor(...statusColor);
        doc.text(status, x, yPosition + 7);

        yPosition += 10;
    });

    return yPosition;
}

addTaskPerformanceToPDF(doc, taskPerformance, yPosition, pageWidth, margin, pageHeight) {
    // Section header
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text("টাস্ক অনুযায়ী পারফরম্যান্স:", margin, yPosition);
    yPosition += 8;

    taskPerformance.forEach((task, index) => {
        // Check for page break
        if (yPosition > pageHeight - 30) {
            doc.addPage();
            yPosition = margin;
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text("টাস্ক অনুযায়ী পারফরম্যান্স (চলমান):", margin, yPosition);
            yPosition += 8;
        }

        // Task background
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPosition, pageWidth - 2 * margin, 25, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, yPosition, pageWidth - 2 * margin, 25);

        // Task name
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(this.truncateText(task.taskName, 50), margin + 5, yPosition + 8);

        // Performance metrics
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`গড় স্কোর: ${task.averageScore.toFixed(2)}`, margin + 5, yPosition + 16);
        doc.text(`সর্বোচ্চ: ${task.maxScore.toFixed(2)}`, margin + 60, yPosition + 16);
        doc.text(`ন্যূনতম: ${task.minScore.toFixed(2)}`, margin + 110, yPosition + 16);
        doc.text(`অংশগ্রহণ: ${task.participants}`, pageWidth - margin - 40, yPosition + 16);

        yPosition += 30;
    });

    return yPosition;
}

addRolePerformanceToPDF(doc, rolePerformance, yPosition, pageWidth, margin) {
    // Section header
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text("দায়িত্ব অনুযায়ী পারফরম্যান্স:", margin, yPosition);
    yPosition += 8;

    const boxWidth = (pageWidth - 2 * margin - 10) / 2;
    let x = margin;

    rolePerformance.forEach((role, index) => {
        if (index % 2 === 0 && index !== 0) {
            x = margin;
            yPosition += 35;
        }

        // Role box
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(x, yPosition, boxWidth, 30, 3, 3, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(x, yPosition, boxWidth, 30, 3, 3);

        // Role name
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(this.truncateText(role.roleName, 25), x + 5, yPosition + 8);

        // Performance info
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`গড় স্কোর: ${role.averageScore.toFixed(2)}`, x + 5, yPosition + 16);
        doc.text(`সদস্য: ${role.count} জন`, x + 5, yPosition + 24);

        x += boxWidth + 5;
    });

    return yPosition + 35;
}

// Utility method to truncate long text
truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}




    // ===============================
    // HELPER METHODS
    // ===============================
    getStudentsInGroup(groupId) {
        return this.state.students.filter((student) => student.groupId === groupId);
    }

    computeMemberCountMap() {
        const map = {};
        this.state.groups.forEach((g) => {
            map[g.id] = 0;
        });
        this.state.students.forEach((s) => {
            if (s.groupId) map[s.groupId] = (map[s.groupId] || 0) + 1;
        });
        return map;
    }

    getFilteredStudents(type = "members") {
        let students = this.state.students;

        if (type === "members") {
            // Apply group filter
            if (this.filters.membersFilterGroupId) {
                students = students.filter(
                    (s) => s.groupId === this.filters.membersFilterGroupId
                );
            }

            // Apply search filter
            if (this.filters.membersSearchTerm) {
                const term = this.filters.membersSearchTerm.toLowerCase();
                students = students.filter(
                    (s) =>
                        s.name.toLowerCase().includes(term) ||
                        s.roll.toLowerCase().includes(term) ||
                        (s.academicGroup && s.academicGroup.toLowerCase().includes(term))
                );
            }
        } else if (type === "cards") {
            // Apply group filter
            if (this.filters.cardsFilterGroupId) {
                students = students.filter(
                    (s) => s.groupId === this.filters.cardsFilterGroupId
                );
            }

            // Apply search filter
            if (this.filters.cardsSearchTerm) {
                const term = this.filters.cardsSearchTerm.toLowerCase();
                students = students.filter(
                    (s) =>
                        s.name.toLowerCase().includes(term) ||
                        s.roll.toLowerCase().includes(term) ||
                        (s.academicGroup && s.academicGroup.toLowerCase().includes(term))
                );
            }
        }

        return students;
    }

    // ===============================
    // CRUD OPERATIONS
    // ===============================
    async addGroup() {
        const name = this.dom.groupNameInput?.value.trim();
        if (!name) {
            this.showToast("গ্রুপের নাম লিখুন", "error");
            return;
        }

        if (name.length > 50) {
            this.showToast("গ্রুপ নাম ৫০ অক্ষরের মধ্যে হতে হবে", "error");
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
            // Clear cache and reload data
            this.cache.clear("groups_data");
            await this.loadGroups();
            this.showToast("গ্রুপ সফলভাবে যোগ করা হয়েছে", "success");
        } catch (error) {
            this.showToast("গ্রুপ যোগ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    async addStudent() {
        const studentData = this.getStudentFormData();
        if (!studentData) return;

        this.showLoading();
        try {
            // Check uniqueness
            const isDuplicate = await this.checkStudentUniqueness(
                studentData.roll,
                studentData.academicGroup
            );
            if (isDuplicate) {
                this.showToast(
                    "এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী ইতিমধ্যে আছে",
                    "error"
                );
                this.hideLoading();
                return;
            }

            await db.collection("students").add({
                ...studentData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            this.clearStudentForm();
            // Clear cache and reload data
            this.cache.clear("students_data");
            await this.loadStudents();
            this.renderGroups();
            this.showToast("শিক্ষার্থী সফলভাবে যোগ করা হয়েছে", "success");
        } catch (error) {
            this.showToast("শিক্ষার্থী যোগ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    async addTask() {
        const taskData = this.getTaskFormData();
        if (!taskData) return;

        this.showLoading();
        try {
            await db.collection("tasks").add({
                ...taskData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            this.clearTaskForm();
            // Clear cache and reload data
            this.cache.clear("tasks_data");
            await this.loadTasks();
            this.showToast("টাস্ক সফলভাবে যোগ করা হয়েছে", "success");
        } catch (error) {
            this.showToast("টাস্ক যোগ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // FORM DATA METHODS
    // ===============================
    getStudentFormData() {
        const name = this.dom.studentNameInput?.value.trim();
        const roll = this.dom.studentRollInput?.value.trim();
        const gender = this.dom.studentGenderInput?.value;
        const groupId = this.dom.studentGroupInput?.value;
        const contact = this.dom.studentContactInput?.value.trim();
        const academicGroup = this.dom.studentAcademicGroupInput?.value.trim();
        const session = this.dom.studentSessionInput?.value.trim();
        const role = this.dom.studentRoleInput?.value;

        if (!name || !roll || !gender || !groupId || !academicGroup || !session) {
            this.showToast("সমস্ত প্রয়োজনীয় তথ্য পূরণ করুন", "error");
            return null;
        }

        if (name.length > 100) {
            this.showToast("নাম ১০০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        if (roll.length > 20) {
            this.showToast("রোল ২০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        return {
            name,
            roll,
            gender,
            groupId,
            contact,
            academicGroup,
            session,
            role,
        };
    }

    getTaskFormData() {
        const name = this.dom.taskNameInput?.value.trim();
        const description = this.dom.taskDescriptionInput?.value.trim();
        const maxScore = parseInt(this.dom.taskMaxScoreInput?.value);
        const dateStr = this.dom.taskDateInput?.value;

        if (!name || !description || isNaN(maxScore) || !dateStr) {
            this.showToast("সমস্ত তথ্য পূরণ করুন", "error");
            return null;
        }

        if (name.length > 100) {
            this.showToast("টাস্ক নাম ১০০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        if (description.length > 500) {
            this.showToast("বিবরণ ৫০০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        if (maxScore < 1 || maxScore > 1000) {
            this.showToast("সর্বোচ্চ স্কোর ১-১০০০ এর মধ্যে হতে হবে", "error");
            return null;
        }

        return {
            name,
            description,
            maxScore,
            date: new Date(dateStr),
        };
    }

    clearStudentForm() {
        const fields = [
            "studentNameInput",
            "studentRollInput",
            "studentContactInput",
            "studentAcademicGroupInput",
            "studentSessionInput",
        ];
        fields.forEach((field) => {
            if (this.dom[field]) this.dom[field].value = "";
        });
    }

    clearTaskForm() {
        if (this.dom.taskNameInput) this.dom.taskNameInput.value = "";
        if (this.dom.taskDescriptionInput) this.dom.taskDescriptionInput.value = "";
        if (this.dom.taskMaxScoreInput) this.dom.taskMaxScoreInput.value = "";
        if (this.dom.taskDateInput) this.dom.taskDateInput.value = "";
    }

    // ===============================
    // EDIT OPERATIONS - FIXED
    // ===============================
    async editStudent(id) {
        const student = this.state.students.find((s) => s.id === id);
        if (!student) return;

        this.dom.editModalTitle.textContent = "শিক্ষার্থী সম্পাদনা";
        this.dom.editModalContent.innerHTML = `
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">নাম</label>
                        <input id="editName" type="text" value="${
                            student.name
                        }" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">রোল</label>
                        <input id="editRoll" type="text" value="${
                            student.roll
                        }" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="20">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">লিঙ্গ</label>
                        <select id="editGender" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                            <option value="ছেলে" ${
                                student.gender === "ছেলে" ? "selected" : ""
                            }>ছেলে</option>
                            <option value="মেয়ে" ${
                                student.gender === "মেয়ে" ? "selected" : ""
                            }>মেয়ে</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">গ্রুপ</label>
                        <select id="editGroup" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                            ${this.state.groups
                                .map(
                                    (g) =>
                                        `<option value="${g.id}" ${
                                            student.groupId === g.id ? "selected" : ""
                                        }>${g.name}</option>`
                                )
                                .join("")}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">যোগাযোগ</label>
                        <input id="editContact" type="text" value="${
                            student.contact || ""
                        }" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">একাডেমিক গ্রুপ</label>
                        <input id="editAcademicGroup" type="text" value="${
                            student.academicGroup || ""
                        }" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="50">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">সেশন</label>
                        <input id="editSession" type="text" value="${
                            student.session || ""
                        }" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="20">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">দায়িত্ব</label>
                        <select id="editRole" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                            <option value="">কোনোটি না</option>
                            ${Object.entries(this.roleNames)
                                .map(
                                    ([key, value]) =>
                                        `<option value="${key}" ${
                                            student.role === key ? "selected" : ""
                                        }>${value}</option>`
                                )
                                .join("")}
                        </select>
                    </div>
                </div>
            `;

        this.editCallback = async () => {
            const newData = {
                name: document.getElementById("editName").value.trim(),
                roll: document.getElementById("editRoll").value.trim(),
                gender: document.getElementById("editGender").value,
                groupId: document.getElementById("editGroup").value,
                contact: document.getElementById("editContact").value.trim(),
                academicGroup: document
                    .getElementById("editAcademicGroup")
                    .value.trim(),
                session: document.getElementById("editSession").value.trim(),
                role: document.getElementById("editRole").value,
            };

            if (
                !newData.name ||
                !newData.roll ||
                !newData.gender ||
                !newData.groupId ||
                !newData.academicGroup ||
                !newData.session
            ) {
                this.showToast("সমস্ত প্রয়োজনীয় তথ্য পূরণ করুন", "error");
                return;
            }

            const rollChanged = newData.roll !== student.roll;
            const academicChanged = newData.academicGroup !== student.academicGroup;

            if (
                (rollChanged || academicChanged) &&
                (await this.checkStudentUniqueness(
                    newData.roll,
                    newData.academicGroup,
                    id
                ))
            ) {
                this.showToast(
                    "এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী ইতিমধ্যে আছে",
                    "error"
                );
                return;
            }

            this.showLoading();
            try {
                await db.collection("students").doc(id).update(newData);
                // Clear cache and reload data
                this.cache.clear("students_data");
                await this.loadStudents();
                this.showToast("শিক্ষার্থী সফলভাবে আপডেট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("সম্পাদনা ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        };

        this.showEditModal();
    }

    async editGroup(id) {
        const group = this.state.groups.find((g) => g.id === id);
        if (!group) return;

        this.dom.editModalTitle.textContent = "গ্রুপ সম্পাদনা";
        this.dom.editModalContent.innerHTML = `
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">গ্রুপ নাম</label>
                    <input id="editGroupName" type="text" value="${group.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="50">
                </div>
            `;

        this.editCallback = async () => {
            const name = document.getElementById("editGroupName").value.trim();
            if (!name) {
                this.showToast("নাম লিখুন", "error");
                return;
            }
            this.showLoading();
            try {
                await db.collection("groups").doc(id).update({ name });
                // Clear cache and reload data
                this.cache.clear("groups_data");
                await this.loadGroups();
                this.showToast("গ্রুপ সফলভাবে আপডেট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("সম্পাদনা ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        };

        this.showEditModal();
    }

    async editTask(id) {
        const task = this.state.tasks.find((t) => t.id === id);
        if (!task) return;

        const dateStr = task.date?.seconds
            ? new Date(task.date.seconds * 1000).toISOString().split("T")[0]
            : "";

        this.dom.editModalTitle.textContent = "টাস্ক সম্পাদনা";
        this.dom.editModalContent.innerHTML = `
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">টাস্ক নাম</label>
                        <input id="editTaskName" type="text" value="${
                            task.name
                        }" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">বিবরণ</label>
                        <textarea id="editTaskDescription" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" maxlength="500">${
                            task.description || ""
                        }</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">সর্বোচ্চ স্কোর</label>
                        <input id="editTaskMaxScore" type="number" value="${
                            task.maxScore
                        }" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white" min="1" max="1000">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">তারিখ</label>
                        <input id="editTaskDate" type="date" value="${dateStr}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                    </div>
                </div>
            `;

        this.editCallback = async () => {
            const name = document.getElementById("editTaskName").value.trim();
            const description = document
                .getElementById("editTaskDescription")
                .value.trim();
            const maxScore = parseInt(
                document.getElementById("editTaskMaxScore").value
            );
            const dateStr = document.getElementById("editTaskDate").value;

            if (!name || !description || isNaN(maxScore) || !dateStr) {
                this.showToast("সমস্ত তথ্য পূরণ করুন", "error");
                return;
            }

            const date = new Date(dateStr);

            this.showLoading();
            try {
                await db
                    .collection("tasks")
                    .doc(id)
                    .update({ name, description, maxScore, date });
                // Clear cache and reload data
                this.cache.clear("tasks_data");
                await this.loadTasks();
                this.showToast("টাস্ক সফলভাবে আপডেট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("সম্পাদনা ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        };

        this.showEditModal();
    }

    async editEvaluation(id) {
        const evaluation = this.state.evaluations.find((e) => e.id === id);
        if (!evaluation) return;

        this.dom.editModalTitle.textContent = "মূল্যায়ন সম্পাদনা";

        // Find task and group
        const task = this.state.tasks.find((t) => t.id === evaluation.taskId);
        const group = this.state.groups.find((g) => g.id === evaluation.groupId);

        this.dom.editModalContent.innerHTML = `
                <div class="mb-4">
                    <p class="text-gray-700 dark:text-gray-300"><strong>টাস্ক:</strong> ${task?.name || "Unknown"}</p>
                    <p class="text-gray-700 dark:text-gray-300"><strong>গ্রুপ:</strong> ${group?.name || "Unknown"}</p>
                </div>
                <p class="text-gray-600 dark:text-gray-400">মূল্যায়ন সম্পাদনা করতে মূল্যায়ন পৃষ্ঠায় যান এবং সংশ্লিষ্ট টাস্ক ও গ্রুপ নির্বাচন করুন।</p>
            `;

        this.editCallback = () => {
            // Navigate to evaluation page with pre-selected values
            this.handleNavigation({
                currentTarget: document.querySelector('[data-page="evaluation"]'),
            });
            setTimeout(() => {
                if (this.dom.evaluationTaskSelect)
                    this.dom.evaluationTaskSelect.value = evaluation.taskId;
                if (this.dom.evaluationGroupSelect)
                    this.dom.evaluationGroupSelect.value = evaluation.groupId;
                this.startEvaluation();
            }, 500);
            this.hideEditModal();
        };

        this.showEditModal();
    }

    // ===============================
    // DELETE OPERATIONS
    // ===============================
    async deleteStudent(id) {
        if (!this.canDelete()) {
            this.showToast("আপনার ডিলিট করার পারমিশন নেই", "error");
            return;
        }
    
        this.showDeleteModal("এই শিক্ষার্থী ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("students").doc(id).delete();
                this.cache.clear("students_data");
                await this.loadStudents();
                this.showToast("শিক্ষার্থী সফলভাবে ডিলিট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("ডিলিট ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        });
    }
    
    async deleteGroup(id) {
        if (!this.canDelete()) {
            this.showToast("আপনার ডিলিট করার পারমিশন নেই", "error");
            return;
        }
    
        this.showDeleteModal("এই গ্রুপ ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("groups").doc(id).delete();
                this.cache.clear("groups_data");
                await this.loadGroups();
                this.showToast("গ্রুপ সফলভাবে ডিলিট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("ডিলিট ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        });
    }
    async deleteGroup(id) {
        this.showDeleteModal("এই গ্রুপ ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("groups").doc(id).delete();
                // Clear cache and reload data
                this.cache.clear("groups_data");
                await this.loadGroups();
                this.showToast("গ্রুপ সফলভাবে ডিলিট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("ডিলিট ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        });
    }

    async deleteTask(id) {
        this.showDeleteModal("এই টাস্ক ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("tasks").doc(id).delete();
                // Clear cache and reload data
                this.cache.clear("tasks_data");
                await this.loadTasks();
                this.showToast("টাস্ক সফলভাবে ডিলিট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("ডিলিট ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        });
    }

    async deleteEvaluation(id) {
        this.showDeleteModal("এই মূল্যায়ন ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("evaluations").doc(id).delete();
                // Clear cache and reload data
                this.cache.clear("evaluations_data");
                await this.loadEvaluations();
                this.showToast("মূল্যায়ন সফলভাবে ডিলিট করা হয়েছে", "success");
            } catch (error) {
                this.showToast("ডিলিট ব্যর্থ: " + error.message, "error");
            } finally {
                this.hideLoading();
            }
        });
    }

    // ===============================
    // UTILITY METHODS
    // ===============================
    async checkStudentUniqueness(roll, academicGroup, excludeId = null) {
        const query = db
            .collection("students")
            .where("roll", "==", roll)
            .where("academicGroup", "==", academicGroup);
        const snap = await query.get();
        return !snap.empty && snap.docs.some((doc) => doc.id !== excludeId);
    }

    // ===============================
    // SEARCH AND FILTER HANDLERS
    // ===============================
    handleStudentSearch(value) {
        this.filters.membersSearchTerm = value.toLowerCase();
        this.renderStudentsList();
    }

    handleAllStudentsSearch(value) {
        this.filters.cardsSearchTerm = value.toLowerCase();
        this.renderStudentCards();
    }

    handleMembersFilter(value) {
        this.filters.membersFilterGroupId = value;
        this.renderStudentsList();
    }

    handleCardsFilter(value) {
        this.filters.cardsFilterGroupId = value;
        this.renderStudentCards();
    }

    handleGroupMembersFilter(value) {
        this.filters.groupMembersFilterGroupId = value;
        this.renderGroupMembers();
    }

    // ===============================
    // DASHBOARD METHODS
    // ===============================
    async loadDashboard() {
        await this.loadEvaluations();
        this.renderStatsSummary();
        this.renderAcademicGroupStats();
        this.renderTaskStats();
        this.renderEvaluationStats();
        this.renderTopGroups();
        this.renderGroupsRanking();
    }

    renderStatsSummary() {
        const statsEl = document.getElementById("statsSummary");
        if (!statsEl) return;

        const totalGroups = this.state.groups.length;
        const totalStudents = this.state.students.length;
        const withoutRole = this.state.students.filter((s) => !s.role).length;
        const academicGroups = new Set(
            this.state.students.map((s) => s.academicGroup)
        ).size;

        // Gender counts
        const genderCount = { ছেলে: 0, মেয়ে: 0 };
        this.state.students.forEach((s) => {
            if (s.gender === "ছেলে") genderCount["ছেলে"]++;
            else if (s.gender === "মেয়ে") genderCount["মেয়ে"]++;
        });

        // Task stats
        const totalTasks = this.state.tasks.length;
        const evaluatedTasks = new Set(this.state.evaluations.map((e) => e.taskId))
            .size;
        const pendingTasks = totalTasks - evaluatedTasks;

        const card = (title, value, icon, color) => `
                <div class="glass-card rounded-xl p-4 shadow-md flex items-center gap-3 card-hover">
                    <div class="p-3 rounded-lg ${color} text-white"><i class="${icon}"></i></div>
                    <div>
                        <div class="text-xs text-gray-500 dark:text-gray-300">${title}</div>
                        <div class="text-2xl font-bold text-gray-800 dark:text-white">${value}</div>
                    </div>
                </div>
            `;

        statsEl.innerHTML = [
            card("মোট গ্রুপ", totalGroups, "fas fa-layer-group", "bg-blue-500"),
            card(
                "মোট শিক্ষার্থী",
                totalStudents,
                "fas fa-user-graduate",
                "bg-green-500"
            ),
            card("একাডেমিক গ্রুপ", academicGroups, "fas fa-book", "bg-purple-500"),
            card(
                "দায়িত্ব বাকি",
                withoutRole,
                "fas fa-hourglass-half",
                "bg-amber-500"
            ),
            card("ছেলে", genderCount["ছেলে"], "fas fa-male", "bg-blue-400"),
            card("মেয়ে", genderCount["মেয়ে"], "fas fa-female", "bg-pink-400"),
            card("মোট টাস্ক", totalTasks, "fas fa-tasks", "bg-indigo-500"),
            card(
                "বাকি মূল্যায়ন",
                pendingTasks,
                "fas fa-clipboard-list",
                "bg-red-500"
            ),
        ].join("");
    }

    renderTaskStats() {
        const container = document.getElementById("taskStats");
        if (!container) return;

        const totalTasks = this.state.tasks.length;
        const evaluatedTasks = new Set(this.state.evaluations.map((e) => e.taskId))
            .size;
        const pendingTasks = totalTasks - evaluatedTasks;

        container.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-gray-700 dark:text-gray-300">মোট টাস্ক:</span>
                    <span class="font-semibold text-gray-800 dark:text-white">${totalTasks}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-700 dark:text-gray-300">মূল্যায়ন completed:</span>
                    <span class="font-semibold text-green-600 dark:text-green-400">${evaluatedTasks}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-700 dark:text-gray-300">বাকি মূল্যায়ন:</span>
                    <span class="font-semibold text-red-600 dark:text-red-400">${pendingTasks}</span>
                </div>
                <div class="progress-bar mt-2">
                    <div class="progress-fill bg-green-500" style="width:${
                        totalTasks ? (evaluatedTasks / totalTasks) * 100 : 0
                    }%"></div>
                </div>
            `;
    }

    renderEvaluationStats() {
        const container = document.getElementById("evaluationStats");
        if (!container) return;

        const totalEvaluations = this.state.evaluations.length;
        const totalScore = this.state.evaluations.reduce((sum, evalItem) => {
            if (!evalItem.scores) return sum;
            return (
                sum +
                Object.values(evalItem.scores).reduce((scoreSum, score) => {
                    return scoreSum + (score.taskScore || 0) + (score.teamworkScore || 0);
                }, 0)
            );
        }, 0);

        const avgScore =
            totalEvaluations > 0 ? (totalScore / totalEvaluations).toFixed(2) : 0;

        container.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-gray-700 dark:text-gray-300">মোট মূল্যায়ন:</span>
                    <span class="font-semibold text-gray-800 dark:text-white">${totalEvaluations}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-700 dark:text-gray-300">গড় স্কোর:</span>
                    <span class="font-semibold text-blue-600 dark:text-blue-400">${avgScore}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-700 dark:text-gray-300">শেষ আপডেট:</span>
                    <span class="text-sm text-gray-500 dark:text-gray-400">${new Date().toLocaleDateString(
                        "bn-BD"
                    )}</span>
                </div>
            `;
    }

    renderAcademicGroupStats() {
        const container = document.getElementById("academicGroupStatsList");
        if (!container) return;
      
        const academicCounts = {};
        this.state.students.forEach((s) => {
          const ag = s.academicGroup || "অজানা";
          academicCounts[ag] = (academicCounts[ag] || 0) + 1;
        });
      
        const total = this.state.students.length;
      
        // কিছু কালার ভ্যারিয়েন্ট (গ্রুপভেদে পাল্টাবে)
        const colorClasses = [
          "from-purple-500 to-indigo-500",
          "from-green-400 to-emerald-500",
          "from-pink-500 to-rose-500",
          "from-orange-400 to-red-500",
          "from-blue-500 to-cyan-500",
          "from-teal-400 to-green-500",
        ];
      
        let colorIndex = 0;
      
        container.innerHTML = `
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3  gap-4">
            ${Object.entries(academicCounts)
              .map(([group, count]) => {
                const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                const gradient = colorClasses[colorIndex % colorClasses.length];
                colorIndex++;
      
                return `
                  <div class="rounded-2xl p-3 transition transform hover:-translate-y-1 hover:shadow-xl 
                              glass-card border border-white/20 dark:border-white/10 ">
                    <div class="flex justify-between items-center mb-3">
                      <div class="font-semibold text-lg text-gray-800 dark:text-gray-100">${group}</div>
                      <div class="text-sm text-gray-600 dark:text-gray-300">${count} (${percent}%)</div>
                    </div>
                    <div class="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div class="h-full bg-gradient-to-r ${gradient} rounded-full transition-all duration-700" 
                           style="width:${percent}%"></div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
    }
      
    renderTopGroups() {
        const container = document.getElementById("topGroupsContainer");
        if (!container) return;
      
        const scores = this.calculateGroupScores();
        const sortedGroups = [...this.state.groups]
          .sort((a, b) => scores[b.id].score - scores[a.id].score)
          .slice(0, 3);
      
        const rankStyles = {
          1: { gradient: "from-yellow-400 via-yellow-500 to-yellow-600", text: "text-yellow-900 dark:text-yellow-100", icon: "👑", glow: "shadow-[0_0_20px_5px_rgba(255,223,0,0.6)]" },
          2: { gradient: "from-gray-300 via-gray-400 to-gray-500", text: "text-gray-900 dark:text-gray-100", icon: "🥈", glow: "shadow-[0_0_15px_3px_rgba(192,192,192,0.5)]" },
          3: { gradient: "from-orange-400 via-orange-500 to-orange-600", text: "text-orange-900 dark:text-orange-100", icon: "🥉", glow: "shadow-[0_0_15px_3px_rgba(205,127,50,0.5)]" }
        };
      
        container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          ${sortedGroups.map((group, index) => {
            const rank = index + 1;
            const style = rankStyles[rank] || { gradient: "from-indigo-400 to-purple-500", text: "text-white", icon: "🏆", glow: "" };
            const delay = index * 150; // entrance delay in ms
      
            return `
              <div 
                class="relative rounded-3xl p-6 sm:p-8 cursor-pointer 
                       bg-gradient-to-br ${style.gradient} ${style.text} ${style.glow} 
                       transform transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl
                       opacity-0 translate-y-6 animate-slide-in"
                style="animation-delay: ${delay}ms"
                onclick="smartEvaluator.showGroupDetailsModal('${group.id}')"
              >
                <!-- Rank Ribbon -->
                <div class="absolute -top-6 left-1/2 transform -translate-x-1/2 
                            bg-white/80 dark:bg-gray-800/70 
                            rounded-full px-3 sm:px-4 py-1 sm:py-2 font-bold 
                            text-sm sm:text-lg shadow-md flex items-center justify-center">
                  <span class="mr-1 text-xl sm:text-3xl">${style.icon}</span> Rank ${rank}
                </div>
      
                <!-- Group Info -->
                <h3 class="font-extrabold text-xl sm:text-2xl mb-2 drop-shadow-sm ">${group.name}</h3>
                <p class="text-base sm:text-lg font-semibold">✨ স্কোর: ${scores[group.id].score.toFixed(2)}</p>
                <p class="text-sm sm:text-base mt-1 opacity-90">👥 সদস্য: ${scores[group.id].members} জন</p>
              </div>
            `;
          }).join("")}
        </div>
      `;
      
    }

    renderGroupsRanking() {
        const container = document.getElementById("groupsRankingList");
        if (!container) return;

        const scores = this.calculateGroupScores();
        const sortedGroups = [...this.state.groups].sort(
            (a, b) => scores[b.id].score - scores[a.id].score
        );

        container.innerHTML = sortedGroups
            .map((group, index) => {
                const rankClass = index < 3 ? `rank-${index + 1}` : "rank-other";
                return `
                    <div class="group-bar flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg card-hover" 
                         onclick="smartEvaluator.showGroupDetailsModal('${
                            group.id
                        }')" style="cursor: pointer;">
                        <span class="rank-badge ${rankClass} mr-3">${
                    index + 1
                }</span>
                        <div class="flex-1">
                            <h4 class="font-medium text-gray-800 dark:text-white">${group.name}</h4>
                            <p class="text-sm text-gray-500 dark:text-gray-400">স্কোর: ${scores[
                                group.id
                            ].score.toFixed(2)} | সদস্য: ${
                    scores[group.id].members
                } জন</p>
                        </div>
                        <i class="fas fa-chevron-right text-gray-400"></i>
                    </div>
                `;
            })
            .join("");
    }

    calculateGroupScores() {
        const groupScores = {};
        this.state.groups.forEach(
            (g) => (groupScores[g.id] = { score: 0, members: 0, evaluatedMembers: 0, name: g.name })
        );

        // First, calculate student averages with the same conditions
        const studentAverages = {};
        this.state.students.forEach((student) => {
            let totalScore = 0;
            let evaluationCount = 0;

            this.state.evaluations.forEach((evalItem) => {
                if (evalItem.scores && evalItem.scores[student.id]) {
                    const score = evalItem.scores[student.id];
                    let optSum = 0;
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach((opt) => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(
                                    (o) => o.id === opt.optionId
                                );
                                if (optDef) optSum += optDef.marks;
                            }
                        });
                    }
                    totalScore += (score.taskScore || 0) + (score.teamworkScore || 0) + optSum;
                    evaluationCount++;
                }
            });

            // Only include students with at least 2 evaluations
            if (evaluationCount >= 2) {
                studentAverages[student.id] = {
                    average: totalScore / evaluationCount,
                    evaluationCount: evaluationCount
                };
            }
        });

        // Calculate group scores based on qualified students
        this.state.students.forEach((student) => {
            if (studentAverages[student.id] && student.groupId && groupScores[student.groupId]) {
                groupScores[student.groupId].score += studentAverages[student.id].average;
                groupScores[student.groupId].members++;
                groupScores[student.groupId].evaluatedMembers++;
            } else if (student.groupId && groupScores[student.groupId]) {
                // Count total members (including those not qualified)
                groupScores[student.groupId].members++;
            }
        });

        for (const id in groupScores) {
            if (groupScores[id].evaluatedMembers > 0) {
                groupScores[id].score = groupScores[id].score / groupScores[id].evaluatedMembers;
            }
        }

        return groupScores;
    }

    // ===============================
    // STUDENT RANKING
    // ===============================
    calculateStudentRankings() {
        const studentScores = {};

        // Initialize all students
        this.state.students.forEach((student) => {
            studentScores[student.id] = {
                student,
                totalScore: 0,
                evaluationCount: 0,
                averageScore: 0,
            };
        });

        // Calculate scores from evaluations
        this.state.evaluations.forEach((evalItem) => {
            if (!evalItem.scores) return;

            Object.entries(evalItem.scores).forEach(([studentId, score]) => {
                if (studentScores[studentId]) {
                    let additionalMarks = 0;
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach((opt) => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(
                                    (o) => o.id === opt.optionId
                                );
                                if (optDef) additionalMarks += optDef.marks;
                            }
                        });
                    }

                    const total =
                        (score.taskScore || 0) +
                        (score.teamworkScore || 0) +
                        additionalMarks;
                    studentScores[studentId].totalScore += total;
                    studentScores[studentId].evaluationCount++;
                }
            });
        });

        // Calculate averages and filter students with at least 2 evaluations
        const rankedStudents = Object.values(studentScores)
            .filter((scoreData) => scoreData.evaluationCount >= 2) // শর্ত ১: কমপক্ষে ২টি evaluation
            .map((scoreData) => {
                if (scoreData.evaluationCount > 0) {
                    scoreData.averageScore = scoreData.totalScore / scoreData.evaluationCount;
                }
                return scoreData;
            })
            .sort((a, b) => {
                // শর্ত ২: averageScore বেশি থাকলে আগে
                if (b.averageScore !== a.averageScore) {
                    return b.averageScore - a.averageScore;
                }
                // শর্ত ৩: গড় সমান হলে বেশি evaluation থাকলে আগে
                return b.evaluationCount - a.evaluationCount;
            });

        return rankedStudents;
    }

    renderStudentRanking() {
        if (!this.dom.studentRankingList) return;

        const rankings = this.calculateStudentRankings();

        if (rankings.length === 0) {
            this.dom.studentRankingList.innerHTML =
                '<p class="text-center text-gray-500 py-8">কোন র‌্যাঙ্কিং ডেটা পাওয়া যায়নি (ন্যূনতম ২টি মূল্যায়ন প্রয়োজন)</p>';
            return;
        }

        this.dom.studentRankingList.innerHTML = rankings
            .map((rankData, index) => {
                const student = rankData.student;
                const group = this.state.groups.find((g) => g.id === student.groupId);
                const roleBadge = student.role
                    ? `<span class="member-role-badge ${student.role}">${
                        this.roleNames[student.role]
                    }</span>`
                    : '<span class="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">দায়িত্ব নেই</span>';

                return `
                <div class="student-rank-item bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <span class="rank-badge ${
                                index < 3 ? `rank-${index + 1}` : "rank-other"
                            }">${index + 1}</span>
                            <div>
                                <h4 class="font-semibold text-gray-800 dark:text-white">${
                                    student.name
                                }</h4>
                                <div class="flex flex-wrap items-center gap-2 mt-1">
                                    ${roleBadge}
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        গ্রুপ: ${group?.name || "গ্রুপ নেই"}
                                    </span>
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        একাডেমিক: ${student.academicGroup || "নির্ধারিত হয়নি"}
                                    </span>
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        রোল: ${student.roll}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-lg font-bold text-blue-600 dark:text-blue-400">
                                ${rankData.averageScore.toFixed(2)}
                            </div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">
                                ${rankData.evaluationCount} টি মূল্যায়ন
                            </div>
                        </div>
                    </div>
                </div>
            `;
            })
            .join("");

        // সার্চ ফাংশনালিটি যোগ করুন
        this.setupRankingSearch();
    }

    setupRankingSearch() {
        // সার্চ ইনপুট তৈরি করুন যদি না থেকে থাকে
        if (!document.getElementById('rankingSearchInput')) {
            const searchContainer = document.createElement('div');
            searchContainer.className = 'mb-4';
            searchContainer.innerHTML = `
                <div class="relative">
                    <input 
                        type="text" 
                        id="rankingSearchInput"
                        placeholder="শিক্ষার্থীর নাম, রোল, বা গ্রুপ দ্বারা সার্চ করুন..."
                        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                    <i class="fas fa-search absolute right-3 top-3 text-gray-400"></i>
                </div>
            `;
            
            // সার্চ ইনপুটটি র‍্যাঙ্কিং লিস্টের আগে যোগ করুন
            this.dom.studentRankingList.parentNode.insertBefore(searchContainer, this.dom.studentRankingList);
        }

        // সার্চ ইভেন্ট লিসেনার যোগ করুন
        const searchInput = document.getElementById('rankingSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleRankingSearch(e.target.value);
            });
        }
    }

    handleRankingSearch(searchTerm) {
        const rankings = this.calculateStudentRankings();
        const term = searchTerm.toLowerCase().trim();

        if (!term) {
            this.renderRankingList(rankings);
            return;
        }

        const filteredRankings = rankings.filter(rankData => {
            const student = rankData.student;
            const group = this.state.groups.find(g => g.id === student.groupId);
            
            return (
                student.name.toLowerCase().includes(term) ||
                student.roll.toLowerCase().includes(term) ||
                (group?.name.toLowerCase().includes(term)) ||
                student.academicGroup?.toLowerCase().includes(term) ||
                (this.roleNames[student.role]?.toLowerCase().includes(term))
            );
        });

        this.renderRankingList(filteredRankings);
    }

    renderRankingList(rankings) {
        if (!this.dom.studentRankingList) return;

        if (rankings.length === 0) {
            this.dom.studentRankingList.innerHTML =
                '<p class="text-center text-gray-500 py-8">কোন ফলাফল পাওয়া যায়নি</p>';
            return;
        }

        this.dom.studentRankingList.innerHTML = rankings
            .map((rankData, index) => {
                const student = rankData.student;
                const group = this.state.groups.find((g) => g.id === student.groupId);
                const roleBadge = student.role
                    ? `<span class="member-role-badge ${student.role}">${
                        this.roleNames[student.role]
                    }</span>`
                    : '<span class="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">দায়িত্ব নেই</span>';

                return `
                <div class="student-rank-item bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <span class="rank-badge ${
                                index < 3 ? `rank-${index + 1}` : "rank-other"
                            }">${index + 1}</span>
                            <div>
                                <h4 class="font-semibold text-gray-800 dark:text-white">${
                                    student.name
                                }</h4>
                                <div class="flex flex-wrap items-center gap-2 mt-1">
                                    ${roleBadge}
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        গ্রুপ: ${group?.name || "গ্রুপ নেই"}
                                    </span>
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        একাডেমিক: ${student.academicGroup || "নির্ধারিত হয়নি"}
                                    </span>
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        রোল: ${student.roll}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-lg font-bold text-blue-600 dark:text-blue-400">
                                ${rankData.averageScore.toFixed(2)}
                            </div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">
                                ${rankData.evaluationCount} টি মূল্যায়ন
                            </div>
                        </div>
                    </div>
                </div>
            `;
            })
            .join("");
    }

    // ===============================
    // GROUP ANALYSIS
    // ===============================
// Update the PDF generation buttons in your group analysis page
renderGroupAnalysis() {
    if (!this.dom.analysisGroupSelect || !this.dom.groupAnalysisDetails) return;

    // Add enhanced PDF actions
    const pdfActionsHTML = `
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 mb-6 border border-blue-100 dark:border-gray-700">
            <div class="text-center mb-4">
                <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">পেশাদার রিপোর্ট জেনারেট</h3>
                <p class="text-gray-600 dark:text-gray-400">A4 সাইজের বাংলা সাপোর্টেড প্রিন্ট-অপ্টিমাইজড রিপোর্ট</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button 
                    onclick="smartEvaluator.generateProfessionalPDF()"
                    class="group p-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-600 transition-all duration-300 hover:scale-105"
                >
                    <div class="text-center">
                        <div class="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-red-200 dark:group-hover:bg-red-800 transition-colors">
                            <i class="fas fa-file-pdf text-red-500 text-xl"></i>
                        </div>
                        <div class="font-semibold text-red-700 dark:text-red-300 mb-1">সমস্ত গ্রুপ PDF</div>
                        <div class="text-xs text-red-600 dark:text-red-400">সম্পূর্ণ বিশ্লেষণ</div>
                    </div>
                </button>
                
                <button 
                    onclick="smartEvaluator.generateProfessionalPDF(document.getElementById('analysisGroupSelect').value)"
                    class="group p-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-300 hover:scale-105"
                >
                    <div class="text-center">
                        <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                            <i class="fas fa-download text-blue-500 text-xl"></i>
                        </div>
                        <div class="font-semibold text-blue-700 dark:text-blue-300 mb-1">নির্বাচিত গ্রুপ PDF</div>
                        <div class="text-xs text-blue-600 dark:text-blue-400">একক গ্রুপ বিশ্লেষণ</div>
                    </div>
                </button>
                
                <button 
                    onclick="smartEvaluator.createPrintPreview(document.getElementById('analysisGroupSelect').value)"
                    class="group p-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-green-200 dark:border-green-800 hover:border-green-300 dark:hover:border-green-600 transition-all duration-300 hover:scale-105"
                >
                    <div class="text-center">
                        <div class="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-green-200 dark:group-hover:bg-green-800 transition-colors">
                            <i class="fas fa-print text-green-500 text-xl"></i>
                        </div>
                        <div class="font-semibold text-green-700 dark:text-green-300 mb-1">প্রিন্ট প্রিভিউ</div>
                        <div class="text-xs text-green-600 dark:text-green-400">প্রিন্ট-ফ্রেন্ডলি ভিউ</div>
                    </div>
                </button>
            </div>
        </div>
    `;

    this.dom.groupAnalysisDetails.innerHTML = pdfActionsHTML + this.dom.groupAnalysisDetails.innerHTML;
    this.updateGroupAnalysis();
}
















// Add this method for selected group PDF
generateSelectedGroupPDF() {
    const selectedGroupId = this.dom.analysisGroupSelect?.value;
    if (!selectedGroupId) {
        this.showToast("প্রথমে একটি গ্রুপ নির্বাচন করুন", "error");
        return;
    }
    this.generateGroupAnalysisPDF(selectedGroupId);
}

updateGroupAnalysis() {
        const selectedGroupId = this.dom.analysisGroupSelect?.value || "";
        const container = this.dom.groupAnalysisDetails;
        if (!container) return;

        let groupsToAnalyze = this.state.groups;
        if (selectedGroupId) {
            groupsToAnalyze = groupsToAnalyze.filter((g) => g.id === selectedGroupId);
        }

        if (groupsToAnalyze.length === 0) {
            container.innerHTML =
                '<p class="text-center text-gray-500 py-8">কোন গ্রুপ পাওয়া যায়নি</p>';
            return;
        }

        let content = "";

        groupsToAnalyze.forEach((group) => {
            const groupStudents = this.state.students.filter(
                (s) => s.groupId === group.id
            );
            const groupEvaluations = this.state.evaluations.filter(
                (e) => e.groupId === group.id
            );

            // Calculate comprehensive statistics
            const stats = this.calculateGroupComprehensiveStats(
                group.id,
                groupStudents,
                groupEvaluations
            );

            content += `
                <div class="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                    <!-- Group Header -->
                    <div class="mb-6 text-center">
                        <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">${
                            group.name
                        } - বিস্তারিত বিশ্লেষণ</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                <div class="text-blue-600 dark:text-blue-400 text-sm">সদস্য</div>
                                <div class="text-xl font-bold text-blue-700 dark:text-blue-300">${
                                    stats.memberCount
                                }</div>
                            </div>
                            <div class="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                                <div class="text-green-600 dark:text-green-400 text-sm">মূল্যায়ন</div>
                                <div class="text-xl font-bold text-green-700 dark:text-green-300">${
                                    stats.evaluationCount
                                }</div>
                            </div>
                            <div class="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                                <div class="text-purple-600 dark:text-purple-400 text-sm">গড় স্কোর</div>
                                <div class="text-xl font-bold text-purple-700 dark:text-purple-300">${stats.overallAverage.toFixed(
                                    2
                                )}</div>
                            </div>
                            <div class="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
                                <div class="text-orange-600 dark:text-orange-400 text-sm">সর্বোচ্চ</div>
                                <div class="text-xl font-bold text-orange-700 dark:text-orange-300">${stats.maxScore.toFixed(
                                    2
                                )}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Performance by Task -->
                    <div class="mb-6">
                        <h4 class="font-semibold text-lg mb-4 text-gray-800 dark:text-white">টাস্ক অনুযায়ী পারফরম্যান্স</h4>
                        <div class="space-y-4">
                            ${stats.taskPerformance
                                .map(
                                    (task) => `
                                    <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                                        <div class="flex justify-between items-center mb-2">
                                            <h5 class="font-medium text-gray-800 dark:text-white">${
                                                task.taskName
                                            }</h5>
                                            <span class="text-sm font-semibold ${
                                                task.averageScore >= 80
                                                    ? "text-green-600 dark:text-green-400"
                                                    : task.averageScore >= 60
                                                    ? "text-yellow-600 dark:text-yellow-400"
                                                    : "text-red-600 dark:text-red-400"
                                            }">
                                                গড়: ${task.averageScore.toFixed(2)}
                                            </span>
                                        </div>
                                        <div class="grid grid-cols-3 gap-2 text-sm">
                                            <div class="text-center">
                                                <div class="text-gray-600 dark:text-gray-400">সর্বোচ্চ</div>
                                                <div class="font-semibold text-green-600 dark:text-green-400">${task.maxScore.toFixed(
                                                    2
                                                )}</div>
                                            </div>
                                            <div class="text-center">
                                                <div class="text-gray-600 dark:text-gray-400">সর্বনিম্ন</div>
                                                <div class="font-semibold text-red-600 dark:text-red-400">${task.minScore.toFixed(
                                                    2
                                                )}</div>
                                            </div>
                                            <div class="text-center">
                                                <div class="text-gray-600 dark:text-gray-400">অংশগ্রহণ</div>
                                                <div class="font-semibold text-blue-600 dark:text-blue-400">${
                                                    task.participants
                                                }</div>
                                            </div>
                                        </div>
                                    </div>
                                `
                                )
                                .join("")}
                        </div>
                    </div>

                    <!-- Role-wise Performance -->
                    <div class="mb-6">
                        <h4 class="font-semibold text-lg mb-4 text-gray-800 dark:text-white">দায়িত্ব অনুযায়ী পারফরম্যান্স</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${stats.rolePerformance
                                .map(
                                    (role) => `
                                    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg">
                                        <div class="flex justify-between items-center mb-2">
                                            <span class="font-medium text-gray-800 dark:text-white">${
                                                role.roleName
                                            }</span>
                                            <span class="text-sm px-2 py-1 rounded ${
                                                role.averageScore >= 80
                                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                    : role.averageScore >= 60
                                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                            }">
                                                ${role.averageScore.toFixed(2)}
                                            </span>
                                        </div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            ${role.count} জন
                                        </div>
                                    </div>
                                `
                                )
                                .join("")}
                        </div>
                    </div>

                    <!-- Student Performance -->
                    <div>
                        <h4 class="font-semibold text-lg mb-4 text-gray-800 dark:text-white">শিক্ষার্থী পারফরম্যান্স</h4>
                        <div class="overflow-x-auto">
                            <table class="w-full border-collapse">
                                <thead>
                                    <tr class="bg-gray-100 dark:bg-gray-700">
                                        <th class="border border-gray-300 dark:border-gray-600 p-2 text-left text-gray-800 dark:text-white">শিক্ষার্থী</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2 text-left text-gray-800 dark:text-white">দায়িত্ব</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2 text-left text-gray-800 dark:text-white">গড় স্কোর</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2 text-left text-gray-800 dark:text-white">মোট মূল্যায়ন</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2 text-left text-gray-800 dark:text-white">স্ট্যাটাস</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stats.studentPerformance
                                        .map(
                                            (student) => `
                                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                <td class="border border-gray-300 dark:border-gray-600 p-2 text-gray-700 dark:text-gray-300">${student.name}</td>
                                                <td class="border border-gray-300 dark:border-gray-600 p-2 text-gray-700 dark:text-gray-300">${student.roleName}</td>
                                                <td class="border border-gray-300 dark:border-gray-600 p-2 text-gray-700 dark:text-gray-300">${student.averageScore.toFixed(
                                                    2
                                                )}</td>
                                                <td class="border border-gray-300 dark:border-gray-600 p-2 text-gray-700 dark:text-gray-300">${student.evaluationCount}</td>
                                                <td class="border border-gray-300 dark:border-gray-600 p-2">
                                                    <span class="px-2 py-1 text-xs rounded ${
                                                        student.averageScore >= 80
                                                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                            : student.averageScore >= 60
                                                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                    }">
                                                        ${
                                                            student.averageScore >= 80
                                                                ? "Excellent"
                                                                : student.averageScore >= 60
                                                                ? "Good"
                                                                : "Needs Improvement"
                                                        }
                                                    </span>
                                                </td>
                                            </tr>
                                        `
                                        )
                                        .join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = content;
    }



    // Enhanced print functionality
printGroupAnalysis() {
    const selectedGroupId = this.dom.analysisGroupSelect?.value;
    const group = selectedGroupId ? this.state.groups.find(g => g.id === selectedGroupId) : null;
    
    const printWindow = window.open('', '_blank');
    const printTitle = group ? `${group.name} - গ্রুপ বিশ্লেষণ` : 'সমস্ত গ্রুপ বিশ্লেষণ';
    
    // Get the current analysis content
    let analysisContent = '';
    if (selectedGroupId && this.dom.groupAnalysisDetails) {
        // Extract content for selected group (skip the PDF buttons part)
        const contentDiv = this.dom.groupAnalysisDetails.querySelector('.group-analysis-content');
        analysisContent = contentDiv ? contentDiv.innerHTML : this.dom.groupAnalysisDetails.innerHTML;
    } else {
        // Generate content for all groups
        analysisContent = this.generatePrintContentForAllGroups();
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${printTitle}</title>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Hind Siliguri', 'SolaimanLipi', sans-serif;
                    line-height: 1.6;
                    color: #333;
                    padding: 20px;
                    background: white;
                    font-size: 14px;
                }
                
                .print-header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #333;
                    padding-bottom: 15px;
                }
                
                .print-title {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #1f2937;
                }
                
                .print-subtitle {
                    font-size: 16px;
                    color: #6b7280;
                    margin-bottom: 10px;
                }
                
                .print-meta {
                    font-size: 12px;
                    color: #9ca3af;
                    display: flex;
                    justify-content: space-between;
                }
                
                .group-section {
                    margin-bottom: 25px;
                    page-break-inside: avoid;
                }
                
                .group-header {
                    background: #f8fafc;
                    padding: 15px;
                    border-left: 4px solid #3b82f6;
                    margin-bottom: 15px;
                }
                
                .group-name {
                    font-size: 18px;
                    font-weight: bold;
                    color: #1e40af;
                    margin-bottom: 5px;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                    margin-bottom: 20px;
                }
                
                .stat-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 12px;
                    text-align: center;
                }
                
                .stat-value {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                
                .stat-label {
                    font-size: 12px;
                    color: #6b7280;
                }
                
                .table-container {
                    margin-bottom: 20px;
                    overflow-x: auto;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                
                th {
                    background: #3b82f6;
                    color: white;
                    padding: 10px;
                    text-align: left;
                    font-weight: 600;
                }
                
                td {
                    padding: 8px 10px;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                tr:nth-child(even) {
                    background: #f9fafb;
                }
                
                .task-performance {
                    margin-bottom: 20px;
                }
                
                .task-item {
                    background: #f8fafc;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    padding: 12px;
                    margin-bottom: 10px;
                }
                
                .task-header {
                    display: flex;
                    justify-content: between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .task-name {
                    font-weight: 600;
                    color: #1f2937;
                }
                
                .task-score {
                    font-weight: bold;
                }
                
                .score-excellent { color: #10b981; }
                .score-good { color: #f59e0b; }
                .score-poor { color: #ef4444; }
                
                .role-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 10px;
                }
                
                .role-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    padding: 12px;
                }
                
                .role-name {
                    font-weight: 600;
                    margin-bottom: 5px;
                }
                
                .page-break {
                    page-break-before: always;
                }
                
                @media print {
                    body {
                        padding: 15px;
                        font-size: 12px;
                    }
                    
                    .print-header {
                        margin-bottom: 20px;
                    }
                    
                    .group-section {
                        margin-bottom: 20px;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                    
                    .page-break {
                        page-break-before: always;
                    }
                    
                    @page {
                        margin: 1cm;
                        size: A4;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <div class="print-title">গ্রুপ বিশ্লেষণ রিপোর্ট</div>
                <div class="print-subtitle">স্মার্ট ইভ্যালুয়েটর সিস্টেম</div>
                <div class="print-meta">
                    <span>প্রস্তুতকৃত: ${new Date().toLocaleDateString('bn-BD')}</span>
                    <span>পৃষ্ঠা: 1</span>
                </div>
            </div>
            ${analysisContent}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        // printWindow.close(); // Uncomment if you want to auto-close after print
    }, 500);
}

generatePrintContentForAllGroups() {
    let content = '';
    
    this.state.groups.forEach((group, index) => {
        if (index > 0) {
            content += '<div class="page-break"></div>';
        }
        
        const groupStudents = this.state.students.filter(s => s.groupId === group.id);
        const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
        
        if (groupEvaluations.length === 0) return;
        
        const stats = this.calculateGroupComprehensiveStats(group.id, groupStudents, groupEvaluations);
        
        content += `
            <div class="group-section">
                <div class="group-header">
                    <div class="group-name">${group.name}</div>
                    <div>মোট সদস্য: ${stats.memberCount} জন | মোট মূল্যায়ন: ${stats.evaluationCount} টি</div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.overallAverage.toFixed(2)}</div>
                        <div class="stat-label">গড় স্কোর</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.maxScore.toFixed(2)}</div>
                        <div class="stat-label">সর্বোচ্চ স্কোর</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.minScore.toFixed(2)}</div>
                        <div class="stat-label">ন্যূনতম স্কোর</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.evaluationCount}</div>
                        <div class="stat-label">মূল্যায়ন সংখ্যা</div>
                    </div>
                </div>
        `;
        
        // Student performance table
        if (stats.studentPerformance.length > 0) {
            content += `
                <div class="table-container">
                    <h3 style="margin-bottom: 10px; color: #1f2937;">শিক্ষার্থীদের পারফরম্যান্স</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>নাম</th>
                                <th>দায়িত্ব</th>
                                <th>গড় স্কোর</th>
                                <th>মূল্যায়ন</th>
                                <th>স্ট্যাটাস</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            stats.studentPerformance.forEach(student => {
                const status = student.averageScore >= 80 ? "Excellent" : 
                              student.averageScore >= 60 ? "Good" : "Needs Improvement";
                const statusClass = student.averageScore >= 80 ? "score-excellent" : 
                                   student.averageScore >= 60 ? "score-good" : "score-poor";
                
                content += `
                    <tr>
                        <td>${student.name}</td>
                        <td>${student.roleName}</td>
                        <td>${student.averageScore.toFixed(2)}</td>
                        <td>${student.evaluationCount}</td>
                        <td class="${statusClass}">${status}</td>
                    </tr>
                `;
            });
            
            content += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        content += `</div>`;
    });
    
    return content;
}


// ===============================
// GRAPH ANALYSIS - NEW FEATURE
// ===============================

renderGraphAnalysis() {
    if (!document.getElementById('graph-analysis-chart')) return;

    const container = document.getElementById('page-graph-analysis');
    if (!container) return;

    // Calculate data for the chart
    const chartData = this.calculateGraphAnalysisData();
    
    // Destroy previous chart if exists
    if (this.graphAnalysisChart) {
        this.graphAnalysisChart.destroy();
    }

    const ctx = document.getElementById('graph-analysis-chart').getContext('2d');
    
    this.graphAnalysisChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'গড় স্কোর',
                    data: chartData.averageScores,
                    backgroundColor: 'rgba(54, 162, 235, 0.8)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                },
                {
                    label: 'সর্বোচ্চ স্কোর',
                    data: chartData.maxScores,
                    backgroundColor: 'rgba(75, 192, 192, 0.8)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                },
                {
                    label: 'ন্যূনতম স্কোর',
                    data: chartData.minScores,
                    backgroundColor: 'rgba(255, 99, 132, 0.8)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const groupId = chartData.groupIds[index];
                    this.showGraphAnalysisDetails(groupId);
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            family: "'Hind Siliguri', 'SolaimanLipi', sans-serif"
                        },
                        color: '#1f2937'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: {
                        family: "'Hind Siliguri', 'SolaimanLipi', sans-serif"
                    },
                    bodyFont: {
                        family: "'Hind Siliguri', 'SolaimanLipi', sans-serif"
                    },
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        font: {
                            family: "'Hind Siliguri', 'SolaimanLipi', sans-serif"
                        },
                        color: '#4b5563'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            family: "'Hind Siliguri', 'SolaimanLipi', sans-serif",
                            size: 12
                        },
                        color: '#4b5563',
                        maxRotation: 45
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

calculateGraphAnalysisData() {
    const labels = [];
    const averageScores = [];
    const maxScores = [];
    const minScores = [];
    const groupIds = [];

    this.state.groups.forEach(group => {
        const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
        
        if (groupEvaluations.length > 0) {
            let totalScore = 0;
            let maxScore = 0;
            let minScore = Infinity;
            let evaluationCount = 0;

            groupEvaluations.forEach(evaluation => {
                if (evaluation.scores) {
                    Object.values(evaluation.scores).forEach(score => {
                        let additionalMarks = 0;
                        if (score.optionMarks) {
                            Object.values(score.optionMarks).forEach(opt => {
                                if (opt.selected) {
                                    const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                    if (optDef) additionalMarks += optDef.marks;
                                }
                            });
                        }

                        const studentScore = (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                        totalScore += studentScore;
                        maxScore = Math.max(maxScore, studentScore);
                        minScore = Math.min(minScore, studentScore);
                        evaluationCount++;
                    });
                }
            });

            if (evaluationCount > 0) {
                labels.push(group.name);
                averageScores.push(totalScore / evaluationCount);
                maxScores.push(maxScore);
                minScores.push(minScore === Infinity ? 0 : minScore);
                groupIds.push(group.id);
            }
        }
    });

    return { labels, averageScores, maxScores, minScores, groupIds };
}

showGraphAnalysisDetails(groupId) {
    const group = this.state.groups.find(g => g.id === groupId);
    if (!group) return;

    const groupEvaluations = this.state.evaluations.filter(e => e.groupId === groupId);
    const groupStudents = this.state.students.filter(s => s.groupId === groupId);

    let detailsHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
            <h3 class="text-xl font-bold mb-4 text-gray-800 dark:text-white">${group.name} - বিস্তারিত বিশ্লেষণ</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div class="text-blue-600 dark:text-blue-400 text-sm">মোট মূল্যায়ন</div>
                    <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">${groupEvaluations.length}</div>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <div class="text-green-600 dark:text-green-400 text-sm">সদস্য সংখ্যা</div>
                    <div class="text-2xl font-bold text-green-700 dark:text-green-300">${groupStudents.length}</div>
                </div>
                <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                    <div class="text-purple-600 dark:text-purple-400 text-sm">গড় স্কোর</div>
                    <div class="text-2xl font-bold text-purple-700 dark:text-purple-300">${this.calculateGroupAverageScore(groupId).toFixed(2)}</div>
                </div>
            </div>
    `;

    if (groupEvaluations.length > 0) {
        detailsHTML += `<h4 class="font-semibold mb-3 text-gray-700 dark:text-gray-300">টাস্ক অনুযায়ী পারফরম্যান্স:</h4>`;
        detailsHTML += `<div class="space-y-2">`;
        
        groupEvaluations.forEach(evalItem => {
            const task = this.state.tasks.find(t => t.id === evalItem.taskId);
            const stats = this.calculateEvaluationStats(evalItem);
            
            if (task) {
                detailsHTML += `
                    <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-700 dark:text-gray-300">${task.name}</span>
                        <span class="font-semibold ${stats.averageScore >= 80 ? 'text-green-600' : stats.averageScore >= 60 ? 'text-yellow-600' : 'text-red-600'}">
                            ${stats.averageScore.toFixed(2)}
                        </span>
                    </div>
                `;
            }
        });
        
        detailsHTML += `</div>`;
    }

    detailsHTML += `</div>`;

    // Show in modal or update details section
    const detailsContainer = document.getElementById('graph-analysis-details');
    if (detailsContainer) {
        detailsContainer.innerHTML = detailsHTML;
        detailsContainer.classList.remove('hidden');
    } else {
        // Create modal to show details
        this.showGraphAnalysisModal(detailsHTML);
    }
}

showGraphAnalysisModal(content) {
    // Create modal dynamically
    const modalId = 'graph-analysis-details-modal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white">গ্রুপ বিশ্লেষণ বিস্তারিত</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="p-6" id="graph-analysis-modal-content"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('graph-analysis-modal-content').innerHTML = content;
    modal.classList.remove('hidden');
}


// ===============================
// ENHANCED GROUP MEMBERS ROLE MANAGEMENT
// ===============================

renderGroupMembersWithRoleManagement() {
    if (!this.dom.groupMembersList) return;

    const groupId = this.filters.groupMembersFilterGroupId;
    let students = this.state.students;
    
    if (groupId) {
        students = students.filter(s => s.groupId === groupId);
    }

    // Apply search filter if any
    const searchTerm = this.filters.groupMembersSearchTerm;
    if (searchTerm) {
        students = students.filter(s => 
            s.name.toLowerCase().includes(searchTerm) ||
            s.roll.toLowerCase().includes(searchTerm) ||
            (s.academicGroup && s.academicGroup.toLowerCase().includes(searchTerm))
        );
    }

    if (students.length === 0) {
        this.dom.groupMembersList.innerHTML = '<p class="text-center text-gray-500 py-8">কোন সদস্য পাওয়া যায়নি</p>';
        return;
    }

    let content = `
        <div class="mb-4">
            <div class="relative">
                <input 
                    type="text" 
                    id="roleManagementSearch"
                    placeholder="শিক্ষার্থীর নাম বা রোল দ্বারা সার্চ করুন..."
                    class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    oninput="smartEvaluator.handleRoleManagementSearch(this.value)"
                >
                <i class="fas fa-search absolute right-3 top-3 text-gray-400"></i>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full border-collapse">
                <thead>
                    <tr class="bg-gray-50 dark:bg-gray-700">
                        <th class="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">শিক্ষার্থী</th>
                        <th class="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">রোল</th>
                        <th class="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">গ্রুপ</th>
                        <th class="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">একাডেমিক গ্রুপ</th>
                        <th class="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">কার্যক্রম</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-600">
    `;

    students.forEach(student => {
        const group = this.state.groups.find(g => g.id === student.groupId);
        
        content += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="p-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                            ${student.name.charAt(0)}
                        </div>
                        <div>
                            <div class="font-medium text-gray-900 dark:text-white">${student.name}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">রোল: ${student.roll}</div>
                        </div>
                    </div>
                </td>
                <td class="p-3">
                    <select 
                        class="role-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        data-student-id="${student.id}"
                        onchange="smartEvaluator.updateStudentRole('${student.id}', this.value)"
                    >
                        <option value="">দায়িত্ব নির্বাচন করুন</option>
                        ${Object.entries(this.roleNames).map(([key, value]) => `
                            <option value="${key}" ${student.role === key ? 'selected' : ''}>${value}</option>
                        `).join('')}
                    </select>
                </td>
                <td class="p-3 text-gray-700 dark:text-gray-300">${group?.name || 'গ্রুপ নেই'}</td>
                <td class="p-3 text-gray-700 dark:text-gray-300">${student.academicGroup || 'নির্ধারিত হয়নি'}</td>
                <td class="p-3">
                    <button 
                        onclick="smartEvaluator.quickUpdateRole('${student.id}')"
                        class="quick-update-btn px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    >
                        দ্রুত আপডেট
                    </button>
                </td>
            </tr>
        `;
    });

    content += `
                </tbody>
            </table>
        </div>
    `;

    this.dom.groupMembersList.innerHTML = content;
}

handleRoleManagementSearch(value) {
    this.filters.groupMembersSearchTerm = value.toLowerCase();
    this.renderGroupMembersWithRoleManagement();
}

async updateStudentRole(studentId, newRole) {
    if (!this.canEdit()) {
        this.showToast("আপনার এডিট করার পারমিশন নেই", "error");
        return;
    }

    this.showLoading("দায়িত্ব আপডেট হচ্ছে...");
    try {
        await db.collection("students").doc(studentId).update({
            role: newRole
        });
        
        this.cache.clear("students_data");
        await this.loadStudents();
        this.showToast("দায়িত্ব সফলভাবে আপডেট করা হয়েছে", "warning"); // Orange for updates
    } catch (error) {
        this.showToast("দায়িত্ব আপডেট করতে সমস্যা: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

quickUpdateRole(studentId) {
    const select = document.querySelector(`.role-select[data-student-id="${studentId}"]`);
    if (select && select.value) {
        this.updateStudentRole(studentId, select.value);
    } else {
        this.showToast("প্রথমে একটি দায়িত্ব নির্বাচন করুন", "error");
    }
}


    calculateGroupComprehensiveStats(groupId, students, evaluations) {
        const stats = {
            memberCount: students.length,
            evaluationCount: evaluations.length,
            overallAverage: 0,
            maxScore: 0,
            minScore: Infinity,
            taskPerformance: [],
            rolePerformance: [],
            studentPerformance: [],
        };

        // Calculate student averages
        const studentAverages = {};
        students.forEach((student) => {
            let totalScore = 0;
            let evalCount = 0;

            evaluations.forEach((evalItem) => {
                const score = evalItem.scores?.[student.id];
                if (score) {
                    let additionalMarks = 0;
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach((opt) => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(
                                    (o) => o.id === opt.optionId
                                );
                                if (optDef) additionalMarks += optDef.marks;
                            }
                        });
                    }

                    const studentScore =
                        (score.taskScore || 0) +
                        (score.teamworkScore || 0) +
                        additionalMarks;
                    totalScore += studentScore;
                    evalCount++;

                    // Update overall max/min
                    stats.maxScore = Math.max(stats.maxScore, studentScore);
                    stats.minScore = Math.min(stats.minScore, studentScore);
                }
            });

            if (evalCount > 0) {
                studentAverages[student.id] = {
                    average: totalScore / evalCount,
                    count: evalCount,
                };
            }
        });

        // Calculate overall average
        const validAverages = Object.values(studentAverages).filter(
            (s) => s.count >= 2
        );
        if (validAverages.length > 0) {
            stats.overallAverage =
                validAverages.reduce((sum, s) => sum + s.average, 0) /
                validAverages.length;
        }

        // Calculate task performance
        const taskStats = {};
        evaluations.forEach((evalItem) => {
            const task = this.state.tasks.find((t) => t.id === evalItem.taskId);
            if (!task) return;

            if (!taskStats[task.id]) {
                taskStats[task.id] = {
                    taskName: task.name,
                    scores: [],
                };
            }

            students.forEach((student) => {
                const score = evalItem.scores?.[student.id];
                if (score) {
                    let additionalMarks = 0;
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach((opt) => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(
                                    (o) => o.id === opt.optionId
                                );
                                if (optDef) additionalMarks += optDef.marks;
                            }
                        });
                    }

                    const totalScore =
                        (score.taskScore || 0) +
                        (score.teamworkScore || 0) +
                        additionalMarks;
                    taskStats[task.id].scores.push(totalScore);
                }
            });
        });

        stats.taskPerformance = Object.values(taskStats).map((task) => ({
            taskName: task.taskName,
            averageScore:
                task.scores.length > 0
                    ? task.scores.reduce((a, b) => a + b, 0) / task.scores.length
                    : 0,
            maxScore: task.scores.length > 0 ? Math.max(...task.scores) : 0,
            minScore: task.scores.length > 0 ? Math.min(...task.scores) : 0,
            participants: task.scores.length,
        }));

        // Calculate role performance
        const roleStats = {};
        students.forEach((student) => {
            const role = student.role || "no-role";
            const roleName = this.roleNames[role] || "দায়িত্ব নেই";
            const studentAvg = studentAverages[student.id];

            if (!roleStats[role]) {
                roleStats[role] = {
                    roleName,
                    scores: [],
                    count: 0,
                };
            }

            if (studentAvg && studentAvg.count >= 2) {
                roleStats[role].scores.push(studentAvg.average);
                roleStats[role].count++;
            }
        });

        stats.rolePerformance = Object.values(roleStats)
            .map((role) => ({
                roleName: role.roleName,
                averageScore:
                    role.scores.length > 0
                        ? role.scores.reduce((a, b) => a + b, 0) / role.scores.length
                        : 0,
                count: role.count,
            }))
            .filter((role) => role.count > 0);

        // Student performance
        stats.studentPerformance = students
            .map((student) => {
                const studentAvg = studentAverages[student.id];
                return {
                    name: student.name,
                    roleName: this.roleNames[student.role] || "দায়িত্ব নেই",
                    averageScore: studentAvg && studentAvg.count >= 2 ? studentAvg.average : 0,
                    evaluationCount: studentAvg ? studentAvg.count : 0,
                };
            })
            .filter((student) => student.evaluationCount >= 2)
            .sort((a, b) => b.averageScore - a.averageScore);

        stats.minScore = stats.minScore === Infinity ? 0 : stats.minScore;

        return stats;
    }

    // ===============================
    // GROUP MEMBERS
    // ===============================
    renderGroupMembers() {
        if (!this.dom.groupMembersGroupSelect || !this.dom.groupMembersList) return;

        // Populate group select
        this.dom.groupMembersGroupSelect.innerHTML = `
            <option value="">সকল গ্রুপ</option>
            ${this.state.groups
                .map((g) => `<option value="${g.id}">${g.name}</option>`)
                .join("")}
        `;

        // Set current filter value if exists
        if (this.filters.groupMembersFilterGroupId) {
            this.dom.groupMembersGroupSelect.value =
                this.filters.groupMembersFilterGroupId;
        }

        this.updateGroupMembersList();
    }

    updateGroupMembersList() {
        const groupId = this.filters.groupMembersFilterGroupId;
        const container = this.dom.groupMembersList;
        if (!container) return;

        let students = this.state.students;
        if (groupId) {
            students = students.filter((s) => s.groupId === groupId);
        }

        if (students.length === 0) {
            container.innerHTML =
                '<p class="text-center text-gray-500 py-8">কোন সদস্য পাওয়া যায়নি</p>';
            return;
        }

        // Group by group
        const studentsByGroup = {};
        students.forEach((student) => {
            const group = this.state.groups.find((g) => g.id === student.groupId);
            const groupName = group?.name || "গ্রুপ নেই";
            if (!studentsByGroup[groupName]) {
                studentsByGroup[groupName] = [];
            }
            studentsByGroup[groupName].push(student);
        });

        let content = "";

        Object.entries(studentsByGroup).forEach(([groupName, groupStudents]) => {
            content += `
                <div class="mb-6">
                    <h3 class="text-lg font-semibold mb-3 text-gray-800 dark:text-white">${groupName}</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${groupStudents
                            .map((student) => {
                                const roleBadge = student.role
                                    ? `<span class="member-role-badge ${student.role}">${
                                        this.roleNames[student.role]
                                    }</span>`
                                    : "";

                                return `
                                <div class="member-card bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                                    <div class="flex items-start space-x-3">
                                        <div class="flex-1">
                                            <h4 class="font-semibold text-gray-800 dark:text-white">${
                                                student.name
                                            }</h4>
                                            <div class="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                                <div class="flex items-center">
                                                    <i class="fas fa-id-card mr-2 w-4"></i>
                                                    <span>রোল: ${student.roll}</span>
                                                </div>
                                                <div class="flex items-center">
                                                    <i class="fas fa-venus-mars mr-2 w-4"></i>
                                                    <span>লিঙ্গ: ${student.gender}</span>
                                                </div>
                                                <div class="flex items-center">
                                                    <i class="fas fa-book mr-2 w-4"></i>
                                                    <span>একাডেমিক: ${
                                                        student.academicGroup ||"নাই"
                                                    }</span>
                                                </div>
                                                <div class="flex items-center">
                                                    <i class="fas fa-calendar mr-2 w-4"></i>
                                                    <span>সেশন: ${
                                                        student.session ||"নাই"
                                                    }</span>
                                                </div>
                                                ${
                                                    student.contact
                                                        ? `
                                                    <div class="flex items-center">
                                                        <i class="fas fa-envelope mr-2 w-4"></i>
                                                        <span>${student.contact}</span>
                                                    </div>
                                                    `
                                                        : ""
                                                }
                                            </div>
                                            ${roleBadge}
                                        </div>
                                    </div>
                                </div>
                            `;
                            })
                            .join("")}
                    </div>
                </div>
            `;
        });

        container.innerHTML = content;
    }

    // ===============================
    // EVALUATION SYSTEM - FIXED
    // ===============================
    startEvaluation() {
        const taskId = this.dom.evaluationTaskSelect?.value;
        const groupId = this.dom.evaluationGroupSelect?.value;

        if (!taskId || !groupId) {
            this.showToast("টাস্ক এবং গ্রুপ নির্বাচন করুন", "error");
            return;
        }

        const task = this.state.tasks.find((t) => t.id === taskId);
        const group = this.state.groups.find((g) => g.id === groupId);
        const students = this.getStudentsInGroup(groupId);

        if (!task || !group) {
            this.showToast("টাস্ক বা গ্রুপ পাওয়া যায়নি", "error");
            return;
        }

        if (students.length === 0) {
            this.showToast("এই গ্রুপে কোন শিক্ষার্থী নেই", "error");
            return;
        }

        // Check if evaluation already exists
        const existingEvaluation = this.state.evaluations.find(
            (e) => e.taskId === taskId && e.groupId === groupId
        );

        this.currentEvaluation = {
            taskId,
            groupId,
            existingId: existingEvaluation?.id,
            scores: existingEvaluation?.scores || {},
        };

        this.renderEvaluationForm(task, group, students);
    }

    renderEvaluationForm(task, group, students) {
        if (!this.dom.evaluationForm) return;

        let formHTML = `
            <div class="evaluation-header bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-6 mb-6">
                <h3 class="text-xl font-bold mb-2">${task.name} - ${group.name}</h3>
                <p class="opacity-90">${task.description || "কোন বিবরণ নেই"}</p>
                <div class="mt-4 flex flex-wrap gap-4 text-sm">
                    <div class="flex items-center">
                        <i class="fas fa-users mr-2"></i>
                        <span>সদস্য: ${students.length} জন</span>
                    </div>
                    <div class="flex items-center">
                        <i class="fas fa-star mr-2"></i>
                        <span>সর্বোচ্চ স্কোর: ${task.maxScore}</span>
                    </div>
                    <div class="flex items-center">
                        <i class="fas fa-calendar mr-2"></i>
                        <span>তারিখ: ${new Date().toLocaleDateString("bn-BD")}</span>
                    </div>
                </div>
            </div>
        `;

        students.forEach((student) => {
            const existingScore = this.currentEvaluation.scores[student.id] || {};
            const roleBadge = student.role
                ? `<span class="member-role-badge ${student.role}">${this.roleNames[student.role]}</span>`
                : "";

            formHTML += `
                <div class="student-evaluation-section bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
                    <div class="student-header flex justify-between items-center mb-4">
                        <div>
                            <h4 class="font-semibold text-lg text-gray-800 dark:text-white">${student.name}</h4>
                            <div class="flex items-center space-x-2 mt-1">
                                ${roleBadge}
                                <span class="text-sm text-gray-500">রোল: ${student.roll}</span>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-sm text-gray-500">একাডেমিক: ${student.academicGroup || "নির্ধারিত হয়নি"}</span>
                        </div>
                    </div>

                    <!-- Task Score -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            টাস্ক স্কোর (০-${task.maxScore})
                        </label>
                        <input 
                            type="number" 
                            min="0" 
                            max="${task.maxScore}"
                            value="${existingScore.taskScore || ""}"
                            onchange="smartEvaluator.updateStudentScore('${student.id}', 'taskScore', this.value)"
                            class="task-score-input w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            placeholder="০-${task.maxScore}"
                        >
                    </div>

                    <!-- Teamwork Score -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            টিমওয়ার্ক স্কোর (০-১০)
                        </label>
                        <input 
                            type="number" 
                            min="0" 
                            max="10"
                            value="${existingScore.teamworkScore || ""}"
                            onchange="smartEvaluator.updateStudentScore('${student.id}', 'teamworkScore', this.value)"
                            class="teamwork-score-input w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            placeholder="০-১০"
                        >
                    </div>

                    <!-- Evaluation Options -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            অতিরিক্ত মূল্যায়ন অপশন
                        </label>
                        <div class="space-y-2">
                            ${this.evaluationOptions
                                .map((option) => {
                                    const existingOption =
                                        existingScore.optionMarks?.[option.id];
                                    const isChecked = existingOption?.selected || false;
                                    const existingMarks = existingOption?.marks || 0;

                                    return `
                                    <label class="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            ${isChecked ? "checked" : ""}
                                            onchange="smartEvaluator.toggleEvaluationOption('${
                                                student.id
                                            }', '${option.id}', this.checked)"
                                            class="option-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        >
                                        <div class="flex-1">
                                            <span class="text-sm text-gray-700 dark:text-gray-300">${
                                                option.text
                                            }</span>
                                            <span class="text-xs ${
                                                option.marks >= 0
                                                    ? "text-green-600"
                                                    : "text-red-600"
                                            }">
                                                (${option.marks >= 0 ? "+" : ""}${
                                        option.marks
                                    } মার্কস)
                                            </span>
                                        </div>
                                    </label>
                                `;
                                })
                                .join("")}
                        </div>
                    </div>

                    <!-- Comments -->
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            মন্তব্য
                        </label>
                        <textarea 
                            oninput="smartEvaluator.updateStudentScore('${student.id}', 'comments', this.value)"
                            class="comments-input w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            placeholder="মন্তব্য লিখুন..."
                            rows="2"
                        >${existingScore.comments || ""}</textarea>
                    </div>
                </div>
            `;
        });

        formHTML += `
            <div class="evaluation-actions flex justify-end space-x-4 mt-6">
                <button 
                    onclick="smartEvaluator.cancelEvaluation()"
                    class="cancel-evaluation-btn px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    বাতিল
                </button>
                <button 
                    onclick="smartEvaluator.submitEvaluation()"
                    class="submit-evaluation-btn px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                    মূল্যায়ন সাবমিট করুন
                </button>
            </div>
        `;

        this.dom.evaluationForm.innerHTML = formHTML;
        this.dom.evaluationForm.classList.remove("hidden");
    }

    updateStudentScore(studentId, field, value) {
        if (!this.currentEvaluation.scores[studentId]) {
            this.currentEvaluation.scores[studentId] = {};
        }

        if (field === "taskScore" || field === "teamworkScore") {
            this.currentEvaluation.scores[studentId][field] = parseFloat(value) || 0;
        } else if (field === "comments") {
            this.currentEvaluation.scores[studentId][field] = value;
        }
    }

    toggleEvaluationOption(studentId, optionId, isChecked) {
        if (!this.currentEvaluation.scores[studentId]) {
            this.currentEvaluation.scores[studentId] = {};
        }
        if (!this.currentEvaluation.scores[studentId].optionMarks) {
            this.currentEvaluation.scores[studentId].optionMarks = {};
        }

        const option = this.evaluationOptions.find((o) => o.id === optionId);
        if (option) {
            this.currentEvaluation.scores[studentId].optionMarks[optionId] = {
                optionId,
                selected: isChecked,
                marks: option.marks,
            };
        }
    }

    cancelEvaluation() {
        this.currentEvaluation = null;
        if (this.dom.evaluationForm) {
            this.dom.evaluationForm.classList.add("hidden");
        }
        this.showToast("মূল্যায়ন বাতিল করা হয়েছে", "info");
    }

    async submitEvaluation() {
        if (!this.currentEvaluation) {
            this.showToast("কোন সক্রিয় মূল্যায়ন নেই", "error");
            return;
        }

        // Validate scores
        const task = this.state.tasks.find(
            (t) => t.id === this.currentEvaluation.taskId
        );
        let hasErrors = false;

        Object.entries(this.currentEvaluation.scores).forEach(([studentId, score]) => {
            if (score.taskScore && score.taskScore > task.maxScore) {
                this.showToast(
                    `টাস্ক স্কোর ${task.maxScore} এর বেশি হতে পারবে না`,
                    "error"
                );
                hasErrors = true;
                return;
            }
            if (score.teamworkScore && score.teamworkScore > 10) {
                this.showToast("টিমওয়ার্ক স্কোর ১০ এর বেশি হতে পারবে না", "error");
                hasErrors = true;
                return;
            }
        });

        if (hasErrors) return;

        this.showLoading("মূল্যায়ন সংরক্ষণ হচ্ছে...");
        try {
            const evaluationData = {
                taskId: this.currentEvaluation.taskId,
                groupId: this.currentEvaluation.groupId,
                scores: this.currentEvaluation.scores,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };

            if (this.currentEvaluation.existingId) {
                // Update existing evaluation
                await db
                    .collection("evaluations")
                    .doc(this.currentEvaluation.existingId)
                    .update(evaluationData);
            } else {
                // Create new evaluation
                await db.collection("evaluations").add(evaluationData);
            }

            // Clear cache and reload data
            this.cache.clear("evaluations_data");
            await this.loadEvaluations();

            this.currentEvaluation = null;
            if (this.dom.evaluationForm) {
                this.dom.evaluationForm.classList.add("hidden");
            }

            this.showToast("মূল্যায়ন সফলভাবে সংরক্ষণ করা হয়েছে", "success");
        } catch (error) {
            console.error("Evaluation submission error:", error);
            this.showToast("মূল্যায়ন সংরক্ষণ ব্যর্থ: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

 // ===============================
// ENHANCED CSV IMPORT WITH BENGALI SUPPORT
// ===============================

handleCSVFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
        this.showToast("শুধুমাত্র CSV ফাইল সাপোর্টেড", "error");
        return;
    }

    const fileName = this.dom.csvFileName;
    if (fileName) fileName.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const csvData = e.target.result;
            // Remove BOM if present for UTF-8 files
            const cleanData = csvData.replace(/^\uFEFF/, '');
            this.csvImportData = this.parseCSV(cleanData);
            
            if (this.csvImportData && this.csvImportData.length > 0) {
                this.showToast(`CSV ফাইল লোড成功: ${this.csvImportData.length} টি রেকর্ড`, "success");
                
                // Show preview
                this.showCSVPreview(this.csvImportData);
            } else {
                this.showToast("CSV ফাইলে কোনো ডেটা পাওয়া যায়নি", "error");
            }
        } catch (error) {
            console.error("CSV parsing error:", error);
            this.showToast("CSV পার্স করতে সমস্যা: " + error.message, "error");
        }
    };
    
    reader.onerror = () => {
        this.showToast("ফাইল পড়তে সমস্যা", "error");
    };
    
    reader.readAsText(file, 'UTF-8');
}

parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        throw new Error("CSV ফাইলে ডেটা নেই");
    }

    // Detect headers (support both English and Bengali)
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Map header names
    const headerMap = {
        'name': 'name', 'নাম': 'name',
        'roll': 'roll', 'রোল': 'roll',
        'gender': 'gender', 'লিঙ্গ': 'gender',
        'groupId': 'groupId', 'গ্রুপ': 'groupId',
        'contact': 'contact', 'যোগাযোগ': 'contact',
        'academicGroup': 'academicGroup', 'একাডেমিক গ্রুপ': 'academicGroup',
        'session': 'session', 'সেশন': 'session',
        'role': 'role', 'দায়িত্ব': 'role'
    };

    const mappedHeaders = headers.map(header => headerMap[header] || header);

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        if (values.length !== headers.length) {
            console.warn(`Line ${i + 1} skipped: column count mismatch`);
            continue;
        }

        const row = {};
        mappedHeaders.forEach((header, index) => {
            if (header) {
                row[header] = values[index].trim().replace(/"/g, '');
            }
        });

        // Only add row if it has required data
        if (row.name && row.roll) {
            data.push(row);
        }
    }

    return data;
}

parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    return result;
}

showCSVPreview(data) {
    if (!data || data.length === 0) return;

    const previewHTML = `
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
            <h4 class="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                <i class="fas fa-eye mr-2"></i>CSV প্রিভিউ (প্রথম ৫টি রেকর্ড)
            </h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-yellow-100 dark:bg-yellow-900/30">
                            ${Object.keys(data[0]).map(key => 
                                `<th class="p-2 text-left border border-yellow-200 dark:border-yellow-700">${key}</th>`
                            ).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.slice(0, 5).map(row => `
                            <tr class="border-b border-yellow-200 dark:border-yellow-700">
                                ${Object.values(row).map(value => 
                                    `<td class="p-2 border border-yellow-200 dark:border-yellow-700">${value || ''}</td>`
                                ).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <p class="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                মোট ${data.length} টি রেকর্ড লোড হয়েছে
            </p>
        </div>
    `;

    // Insert preview before process button
    const existingPreview = document.getElementById('csvPreview');
    if (existingPreview) {
        existingPreview.remove();
    }

    const previewDiv = document.createElement('div');
    previewDiv.id = 'csvPreview';
    previewDiv.innerHTML = previewHTML;
    
    const processBtn = this.dom.processImportBtn;
    if (processBtn && processBtn.parentNode) {
        processBtn.parentNode.insertBefore(previewDiv, processBtn);
    }
}

async processCSVImport() {
    if (!this.csvImportData || this.csvImportData.length === 0) {
        this.showToast("প্রথমে CSV ফাইল নির্বাচন করুন", "error");
        return;
    }

    this.showLoading("শিক্ষার্থী ডেটা ইমপোর্ট হচ্ছে...");
    try {
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const [index, studentData] of this.csvImportData.entries()) {
            try {
                // Validate required fields
                if (!studentData.name || !studentData.roll || !studentData.gender) {
                    errors.push(`সারি ${index + 2}: নাম, রোল এবং লিঙ্গ প্রয়োজন`);
                    errorCount++;
                    continue;
                }

                // Check uniqueness
                const isDuplicate = await this.checkStudentUniqueness(
                    studentData.roll,
                    studentData.academicGroup || "default"
                );
                
                if (isDuplicate) {
                    errors.push(`সারি ${index + 2}: এই রোল নম্বর ইতিমধ্যে আছে`);
                    errorCount++;
                    continue;
                }

                // Map group name to ID if provided
                let groupId = studentData.groupId || "";
                if (studentData.groupName && !studentData.groupId) {
                    const group = this.state.groups.find(g => 
                        g.name === studentData.groupName
                    );
                    groupId = group ? group.id : "";
                }

                await db.collection("students").add({
                    name: studentData.name,
                    roll: studentData.roll,
                    gender: studentData.gender,
                    groupId: groupId,
                    contact: studentData.contact || "",
                    academicGroup: studentData.academicGroup || "সাধারণ",
                    session: studentData.session || "২০২৩-২৪",
                    role: studentData.role || "",
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                
                successCount++;
            } catch (error) {
                errors.push(`সারি ${index + 2}: ${error.message}`);
                errorCount++;
                console.error("Error importing student:", error);
            }
        }

        // Clear cache and reload data
        this.cache.clear("students_data");
        await this.loadStudents();

        this.csvImportData = null;
        if (this.dom.csvFileInput) this.dom.csvFileInput.value = "";
        if (this.dom.csvFileName) this.dom.csvFileName.textContent = "";
        
        // Remove preview
        const preview = document.getElementById('csvPreview');
        if (preview) preview.remove();

        // Show results
        this.showImportResults(successCount, errorCount, errors);
        
    } catch (error) {
        this.showToast("ইমপোর্ট ব্যর্থ: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

    parseCSV(csvText) {
        const lines = csvText.split("\n").filter((line) => line.trim());
        if (lines.length < 2) {
            throw new Error("CSV ফাইলে ডেটা নেই");
        }

        const headers = lines[0].split(",").map((h) => h.trim());
        const requiredHeaders = ["name", "roll", "gender", "academicGroup", "session"];
        const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

        if (missingHeaders.length > 0) {
            throw new Error(
                `প্রয়োজনীয় হেডার missing: ${missingHeaders.join(", ")}`
            );
        }

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",").map((v) => v.trim());
            if (values.length !== headers.length) continue;

            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            data.push(row);
        }

        return data;
    }

    async processCSVImport() {
        if (!this.csvImportData || this.csvImportData.length === 0) {
            this.showToast("প্রথমে CSV ফাইল নির্বাচন করুন", "error");
            return;
        }

        this.showLoading("শিক্ষার্থী ইমপোর্ট হচ্ছে...");
        try {
            let successCount = 0;
            let errorCount = 0;

            for (const studentData of this.csvImportData) {
                try {
                    // Check uniqueness
                    const isDuplicate = await this.checkStudentUniqueness(
                        studentData.roll,
                        studentData.academicGroup
                    );
                    if (isDuplicate) {
                        errorCount++;
                        continue;
                    }

                    await db.collection("students").add({
                        name: studentData.name,
                        roll: studentData.roll,
                        gender: studentData.gender,
                        groupId: studentData.groupId || "",
                        contact: studentData.contact || "",
                        academicGroup: studentData.academicGroup,
                        session: studentData.session,
                        role: studentData.role || "",
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                    successCount++;
                } catch (error) {
                    errorCount++;
                    console.error("Error importing student:", error);
                }
            }

            // Clear cache and reload data
            this.cache.clear("students_data");
            await this.loadStudents();

            this.csvImportData = null;
            if (this.dom.csvFileInput) this.dom.csvFileInput.value = "";
            if (this.dom.csvFileName) this.dom.csvFileName.textContent = "";

            this.showToast(
                `ইমপোর্ট সম্পন্ন: ${successCount} সফল, ${errorCount} ব্যর্থ`,
                successCount > 0 ? "success" : "warning"
            );
        } catch (error) {
            this.showToast("ইমপোর্ট ব্যর্থ: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    downloadCSVTemplate() {
        const headers = [
            "name",
            "roll",
            "gender",
            "groupId",
            "contact",
            "academicGroup",
            "session",
            "role",
        ];
        const template = [headers.join(",")].join("\n");

        const blob = new Blob([template], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "students_template.csv";
        a.click();
        window.URL.revokeObjectURL(url);
    }

 // ===============================
// ENHANCED EXPORT FUNCTIONALITY
// ===============================

async exportAllData() {
    this.showLoading("সমস্ত ডেটা প্রস্তুত হচ্ছে...");
    try {
        // Create a comprehensive data object
        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: this.currentUser?.email || "public",
                totalGroups: this.state.groups.length,
                totalStudents: this.state.students.length,
                totalTasks: this.state.tasks.length,
                totalEvaluations: this.state.evaluations.length
            },
            groups: this.state.groups,
            students: this.state.students.map(student => {
                const group = this.state.groups.find(g => g.id === student.groupId);
                return {
                    ...student,
                    groupName: group?.name || "গ্রুপ নেই"
                };
            }),
            tasks: this.state.tasks,
            evaluations: this.state.evaluations.map(evaluation => {
                const task = this.state.tasks.find(t => t.id === evaluation.taskId);
                const group = this.state.groups.find(g => g.id === evaluation.groupId);
                return {
                    ...evaluation,
                    taskName: task?.name || "অজানা টাস্ক",
                    groupName: group?.name || "অজানা গ্রুপ"
                };
            })
        };

        // Create JSON file
        const jsonBlob = new Blob(
            [JSON.stringify(exportData, null, 2)], 
            { type: 'application/json' }
        );
        
        const timestamp = new Date().toISOString().split('T')[0];
        this.downloadBlob(jsonBlob, `smart_evaluator_backup_${timestamp}.json`);
        
        this.showToast("সমস্ত ডেটা JSON ফাইলে এক্সপোর্ট成功", "success");
    } catch (error) {
        this.showToast("এক্সপোর্ট ব্যর্থ: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

async exportStudentsCSV() {
    this.showLoading("শিক্ষার্থী ডেটা CSV তৈরি হচ্ছে...");
    try {
        const headers = ["নাম", "রোল", "লিঙ্গ", "গ্রুপ", "যোগাযোগ", "একাডেমিক গ্রুপ", "সেশন", "দায়িত্ব"];
        
        const csvData = this.state.students.map((student) => {
            const group = this.state.groups.find((g) => g.id === student.groupId);
            return [
                `"${student.name}"`,
                `"${student.roll}"`,
                `"${student.gender}"`,
                `"${group?.name || ""}"`,
                `"${student.contact || ""}"`,
                `"${student.academicGroup || ""}"`,
                `"${student.session || ""}"`,
                `"${this.roleNames[student.role] || student.role || ""}"`
            ];
        });

        // Add BOM for UTF-8 and Bengali support
        const BOM = "\uFEFF";
        const csvContent = BOM + [headers, ...csvData]
            .map(row => row.join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        this.downloadBlob(blob, "শিক্ষার্থী_তালিকা.csv");
        
        this.showToast("শিক্ষার্থী ডেটা CSV হিসেবে এক্সপোর্ট成功", "success");
    } catch (error) {
        this.showToast("এক্সপোর্ট ব্যর্থ: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

// ===============================
// ENHANCED EXPORT VIEW MANAGEMENT
// ===============================

// Initialize export page when shown
initializeExportPage() {
    if (!this.state) this.state = { students: [], groups: [], evaluations: [] };
    this.updateExportStats();
    this.loadExportHistory();
}

// Update quick stats
updateExportStats() {
    const s = this.state;
    const el = (id) => document.getElementById(id);
    if (!s) return;

    el('totalStudentsCount').textContent = s.students?.length || 0;
    el('totalGroupsCount').textContent = s.groups?.length || 0;
    el('totalEvaluationsCount').textContent = s.evaluations?.length || 0;

    const lastExport = localStorage.getItem('lastExportTime');
    el('lastExportTime').textContent = lastExport
        ? new Date(lastExport).toLocaleDateString('bn-BD')
        : '—';
}

// Show export progress
showExportProgress(message, percent = 0) {
    const hide = (id) => document.getElementById(id).classList.add('hidden');
    const show = (id) => document.getElementById(id).classList.remove('hidden');

    hide('exportInitialState');
    show('exportProgressSection');
    hide('exportResultsSection');
    hide('exportErrorSection');

    document.getElementById('exportProgressText').textContent = message;
    document.getElementById('exportProgressPercent').textContent = `${percent}%`;
    document.getElementById('exportProgressBar').style.width = `${percent}%`;

    const details = document.getElementById('exportProgressDetails');
    details.innerHTML = percent
        ? `
        <div class="flex justify-between text-xs">
            <span>প্রক্রিয়া চলছে...</span>
            <span>${percent}% সম্পূর্ণ</span>
        </div>`
        : '';
}

// Show export success
showExportSuccess(title, message, stats = null, preview = null) {
    document.getElementById('exportProgressSection').classList.add('hidden');
    document.getElementById('exportResultsSection').classList.remove('hidden');

    document.getElementById('exportSuccessTitle').textContent = title;
    document.getElementById('exportSuccessMessage').textContent = message;

    if (stats) this.updateExportStatsDisplay(stats);
    if (preview) this.showExportPreview(preview);

    localStorage.setItem('lastExportTime', new Date().toISOString());
    this.updateExportStats();
    this.addToExportHistory(title);
}

// Show export error
showExportError(title, message) {
    document.getElementById('exportProgressSection').classList.add('hidden');
    document.getElementById('exportErrorSection').classList.remove('hidden');

    document.getElementById('exportErrorTitle').textContent = title;
    document.getElementById('exportErrorMessage').textContent = message || 'অজানা ত্রুটি ঘটেছে।';
}

// Update export statistics display
updateExportStatsDisplay(stats) {
    const container = document.getElementById('exportStats');
    container.innerHTML = '';

    Object.entries(stats).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg';
        item.innerHTML = `
            <div class="text-lg font-bold text-gray-800 dark:text-white">${value}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 capitalize">${key}</div>
        `;
        container.appendChild(item);
    });
}

// Show export preview
showExportPreview(content) {
    const previewSection = document.getElementById('exportPreviewSection');
    const previewContent = document.getElementById('exportPreviewContent');
    previewContent.innerHTML = content;
    previewSection.classList.remove('hidden');
}

// Load export history
loadExportHistory() {
    const history = JSON.parse(localStorage.getItem('exportHistory') || '[]');
    const list = document.getElementById('exportHistoryList');

    if (!Array.isArray(history) || history.length === 0) {
        list.innerHTML = `
            <div class="text-center text-gray-500 dark:text-gray-400 py-4">
                <i class="fas fa-clock text-2xl mb-2"></i>
                <p>কোনো এক্সপোর্ট ইতিহাস নেই</p>
            </div>`;
        return;
    }

    list.innerHTML = history
        .slice(0, 5)
        .map(
            (item) => `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div class="flex items-center">
                <i class="fas fa-file-export text-green-500 mr-3"></i>
                <div>
                    <div class="text-sm font-medium text-gray-800 dark:text-white">${item.name}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${item.time}</div>
                </div>
            </div>
            <span class="text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                ${item.type}
            </span>
        </div>`
        )
        .join('');
}

// Add to export history
addToExportHistory(exportName) {
    const history = JSON.parse(localStorage.getItem('exportHistory') || '[]');
    const newItem = {
        name: exportName,
        type: 'সফল',
        time: new Date().toLocaleString('bn-BD'),
    };

    history.unshift(newItem);
    if (history.length > 10) history.length = 10;

    localStorage.setItem('exportHistory', JSON.stringify(history));
    this.loadExportHistory();
}

// Export Students CSV
async exportStudentsCSV() {
    this.showExportProgress('শিক্ষার্থী ডেটা CSV তৈরি হচ্ছে...', 10);

    try {
        // Step updates
        this.showExportProgress('ডেটা সংগ্রহ করা হচ্ছে...', 40);
        await new Promise((r) => setTimeout(r, 400));

        this.showExportProgress('CSV ফরম্যাটে কনভার্ট হচ্ছে...', 70);
        await new Promise((r) => setTimeout(r, 400));

        const headers = [
            'নাম',
            'রোল',
            'লিঙ্গ',
            'গ্রুপ',
            'যোগাযোগ',
            'একাডেমিক গ্রুপ',
            'সেশন',
            'দায়িত্ব',
        ];

        const csvData = this.state.students.map((student) => {
            const group = this.state.groups.find((g) => g.id === student.groupId);
            return [
                student.name,
                student.roll,
                student.gender,
                group?.name || '',
                student.contact || '',
                student.academicGroup || '',
                student.session || '',
                this.roleNames?.[student.role] || student.role || '',
            ].map((v) => `"${v}"`);
        });

        const BOM = '\uFEFF';
        const csvContent =
            BOM + [headers, ...csvData].map((row) => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        this.showExportProgress('ডাউনলোড শুরু হচ্ছে...', 100);
        await new Promise((r) => setTimeout(r, 300));

        this.downloadBlob(blob, 'শিক্ষার্থী_তালিকা.csv');
        this.showExportSuccess(
            'শিক্ষার্থী CSV এক্সপোর্ট সফল!',
            `${this.state.students.length} টি শিক্ষার্থীর ডেটা সংরক্ষিত হয়েছে।`,
            {
                'মোট শিক্ষার্থী': this.state.students.length,
                'গ্রুপ সংখ্যা': new Set(this.state.students.map((s) => s.groupId)).size,
                'ফাইল সাইজ': this.formatFileSize(blob.size),
            },
            this.generateStudentsPreview()
        );
    } catch (error) {
        console.error(error);
        this.showExportError('CSV এক্সপোর্ট ব্যর্থ', error.message);
    }
}

// Generate students preview
generateStudentsPreview() {
    const students = this.state.students.slice(0, 5);
    const rows = students
        .map((student) => {
            const group = this.state.groups.find((g) => g.id === student.groupId);
            return `
                <tr class="border-b border-gray-200 dark:border-gray-600">
                    <td class="p-2">${student.name}</td>
                    <td class="p-2">${student.roll}</td>
                    <td class="p-2">${group?.name || 'নাই'}</td>
                </tr>`;
        })
        .join('');

    const remaining = this.state.students.length - students.length;
    return `
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-100 dark:bg-gray-700">
                    <th class="p-2 text-left">নাম</th>
                    <th class="p-2 text-left">রোল</th>
                    <th class="p-2 text-left">গ্রুপ</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${remaining > 0
            ? `<p class="text-xs text-gray-500 mt-2">এবং আরও ${remaining} টি শিক্ষার্থী...</p>`
            : ''}`;
}

// Format file size
formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Enhanced downloadBlob
downloadBlob(blob, filename) {
    try {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        this.showToast(`ফাইল ডাউনলোড শুরু হয়েছে: ${filename}`, 'success');

        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 800);
    } catch (error) {
        console.error('Download error:', error);
        this.showExportError('ডাউনলোড ব্যর্থ', 'ফাইল ডাউনলোড করতে সমস্যা হচ্ছে।');
    }
}

// Export Groups CSV
async exportGroupsCSV() {
    this.showLoading('গ্রুপ ডেটা CSV তৈরি হচ্ছে...');
    try {
        const headers = ['গ্রুপ নাম', 'সদস্য সংখ্যা', 'গড় স্কোর'];
        const memberCounts = this.computeMemberCountMap();

        const csvData = this.state.groups.map((group) => {
            const memberCount = memberCounts[group.id] || 0;
            const avgScore = this.calculateGroupAverageScore(group.id).toFixed(2);
            return [`"${group.name}"`, `"${memberCount}"`, `"${avgScore}"`];
        });

        const BOM = '\uFEFF';
        const csvContent =
            BOM + [headers, ...csvData].map((row) => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        this.downloadBlob(blob, 'গ্রুপ_তালিকা.csv');
        this.showToast('গ্রুপ ডেটা CSV হিসেবে এক্সপোর্ট সফল', 'success');
    } catch (error) {
        this.showToast('এক্সপোর্ট ব্যর্থ: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}


async exportEvaluationsCSV() {
    this.showLoading("মূল্যায়ন ডেটা CSV তৈরি হচ্ছে...");
    try {
        const headers = ["টাস্ক নাম", "গ্রুপ", "শিক্ষার্থী", "টাস্ক স্কোর", "টিমওয়ার্ক স্কোর", "মোট স্কোর", "তারিখ"];
        
        const csvData = [];
        this.state.evaluations.forEach((evaluation) => {
            const task = this.state.tasks.find(t => t.id === evaluation.taskId);
            const group = this.state.groups.find(g => g.id === evaluation.groupId);
            
            if (evaluation.scores) {
                Object.entries(evaluation.scores).forEach(([studentId, score]) => {
                    const student = this.state.students.find(s => s.id === studentId);
                    if (student) {
                        let additionalMarks = 0;
                        if (score.optionMarks) {
                            Object.values(score.optionMarks).forEach((opt) => {
                                if (opt.selected) {
                                    const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                    if (optDef) additionalMarks += optDef.marks;
                                }
                            });
                        }
                        
                        const totalScore = (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                        const dateStr = evaluation.updatedAt?.seconds ? 
                            new Date(evaluation.updatedAt.seconds * 1000).toLocaleDateString('bn-BD') : 
                            "তারিখ নেই";
                            
                        csvData.push([
                            `"${task?.name || 'অজানা টাস্ক'}"`,
                            `"${group?.name || 'অজানা গ্রুপ'}"`,
                            `"${student.name}"`,
                            `"${score.taskScore || 0}"`,
                            `"${score.teamworkScore || 0}"`,
                            `"${totalScore}"`,
                            `"${dateStr}"`
                        ]);
                    }
                });
            }
        });

        const BOM = "\uFEFF";
        const csvContent = BOM + [headers, ...csvData]
            .map(row => row.join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        this.downloadBlob(blob, "মূল্যায়ন_তালিকা.csv");
        
        this.showToast("মূল্যায়ন ডেটা CSV হিসেবে এক্সপোর্ট成功", "success");
    } catch (error) {
        this.showToast("এক্সপোর্ট ব্যর্থ: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

// Enhanced PDF Export functionality
async exportAnalysisPDF() {
    if (typeof jsPDF === 'undefined') {
        this.showToast("PDF জেনারেটর লোড করা যায়নি। পৃষ্ঠাটি রিফ্রেশ করুন।", "error");
        return;
    }

    this.showLoading("PDF রিপোর্ট তৈরি হচ্ছে...");
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Set Bengali font (if available) or use default
        doc.setFont("helvetica", "normal");
        
        // Title
        doc.setFontSize(20);
        doc.setTextColor(40, 40, 40);
        doc.text("Smart Evaluator - বিশ্লেষণ রিপোর্ট", 105, 20, { align: "center" });
        
        // Date and summary
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`প্রস্তুতকৃত: ${new Date().toLocaleDateString('bn-BD')}`, 105, 30, { align: "center" });
        doc.text(`মোট গ্রুপ: ${this.state.groups.length} | মোট শিক্ষার্থী: ${this.state.students.length}`, 105, 37, { align: "center" });
        
        let yPosition = 50;
        
        // Group Performance Summary
        doc.setFontSize(16);
        doc.setTextColor(40, 40, 40);
        doc.text("গ্রুপ পারফরম্যান্স সারসংক্ষেপ", 20, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        this.state.groups.forEach((group, index) => {
            if (yPosition > 270) {
                doc.addPage();
                yPosition = 20;
            }
            
            const avgScore = this.calculateGroupAverageScore(group.id);
            const students = this.state.students.filter(s => s.groupId === group.id);
            
            doc.text(`${index + 1}. ${group.name}`, 25, yPosition);
            doc.text(`সদস্য: ${students.length} জন, গড় স্কোর: ${avgScore.toFixed(2)}`, 35, yPosition + 5);
            yPosition += 12;
        });
        
        yPosition += 10;
        
        // Top Performing Students
        if (yPosition > 250) {
            doc.addPage();
            yPosition = 20;
        }
        
        doc.setFontSize(16);
        doc.text("সেরা শিক্ষার্থীগণ", 20, yPosition);
        yPosition += 10;
        
        const topStudents = this.calculateStudentRankings().slice(0, 10);
        doc.setFontSize(10);
        
        topStudents.forEach((studentData, index) => {
            if (yPosition > 270) {
                doc.addPage();
                yPosition = 20;
            }
            
            const student = studentData.student;
            doc.text(`${index + 1}. ${student.name}`, 25, yPosition);
            doc.text(`রোল: ${student.roll}, গড় স্কোর: ${studentData.averageScore.toFixed(2)}`, 35, yPosition + 5);
            yPosition += 12;
        });
        
        // Save the PDF
        const timestamp = new Date().toISOString().split('T')[0];
        doc.save(`smart_evaluator_report_${timestamp}.pdf`);
        
        this.showToast("PDF রিপোর্ট সফলভাবে ডাউনলোড হয়েছে", "success");
    } catch (error) {
        console.error("PDF generation error:", error);
        this.showToast("PDF তৈরি করতে সমস্যা: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

// Utility method for downloading files
downloadBlob(blob, filename) {
    try {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error("Download error:", error);
        this.showToast("ফাইল ডাউনলোড করতে সমস্যা", "error");
    }
}

// Show import results in modal
showImportResults(successCount, errorCount, errors) {
    const resultsHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white">ইমপোর্ট ফলাফল</h3>
                <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                        <div class="text-green-600 dark:text-green-400 font-semibold">সফল</div>
                        <div class="text-2xl font-bold text-green-700 dark:text-green-300">${successCount}</div>
                    </div>
                    <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                        <div class="text-red-600 dark:text-red-400 font-semibold">ত্রুটিপূর্ণ</div>
                        <div class="text-2xl font-bold text-red-700 dark:text-red-300">${errorCount}</div>
                    </div>
                </div>
                ${errors.length > 0 ? `
                    <div>
                        <h4 class="font-semibold mb-2 text-gray-700 dark:text-gray-300">ত্রুটি বিবরণ:</h4>
                        <div class="bg-red-50 dark:bg-red-900/10 p-4 rounded-lg max-h-60 overflow-y-auto">
                            ${errors.map(error => `<p class="text-sm text-red-600 dark:text-red-400 mb-1">• ${error}</p>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = resultsHTML;
    document.body.appendChild(modal);
}

    async exportStudentsCSV() {
        this.showLoading("শিক্ষার্থী ডেটা এক্সপোর্ট হচ্ছে...");
        try {
            const headers = [
                "Name",
                "Roll",
                "Gender",
                "Group",
                "Contact",
                "Academic Group",
                "Session",
                "Role",
            ];
            const csvData = this.state.students.map((student) => {
                const group = this.state.groups.find((g) => g.id === student.groupId);
                return [
                    student.name,
                    student.roll,
                    student.gender,
                    group?.name || "",
                    student.contact || "",
                    student.academicGroup || "",
                    student.session || "",
                    this.roleNames[student.role] || student.role || "",
                ];
            });

            const csvContent = [headers, ...csvData]
                .map((row) => row.map((cell) => `"${cell}"`).join(","))
                .join("\n");

            const blob = new Blob([csvContent], { type: "text/csv" });
            this.downloadBlob(blob, "students_data.csv");
            this.showToast("শিক্ষার্থী ডেটা এক্সপোর্ট成功", "success");
        } catch (error) {
            this.showToast("এক্সপোর্ট ব্যর্থ: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    async exportGroupsCSV() {
        this.showLoading("গ্রুপ ডেটা এক্সপোর্ট হচ্ছে...");
        try {
            const memberCountMap = this.computeMemberCountMap();
            const headers = ["Group Name", "Member Count"];
            const csvData = this.state.groups.map((group) => [
                group.name,
                memberCountMap[group.id] || 0,
            ]);

            const csvContent = [headers, ...csvData]
                .map((row) => row.map((cell) => `"${cell}"`).join(","))
                .join("\n");

            const blob = new Blob([csvContent], { type: "text/csv" });
            this.downloadBlob(blob, "groups_data.csv");
            this.showToast("গ্রুপ ডেটা এক্সপোর্ট成功", "success");
        } catch (error) {
            this.showToast("এক্সপোর্ট ব্যর্থ: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

  // ===============================
// EXPORT EVALUATIONS CSV - FIXED VERSION
// ===============================

async exportEvaluationsCSV() {
    this.showLoading("মূল্যায়ন ডেটা এক্সপোর্ট হচ্ছে...");
    try {
        const headers = [
            "Task",
            "Group",
            "Student",
            "Task Score",
            "Teamwork Score",
            "Additional Marks",
            "Total Score",
            "Comments",
        ];

        const csvData = [];

        this.state.evaluations.forEach((evaluation) => {
            const task = this.state.tasks.find((t) => t.id === evaluation.taskId);
            const group = this.state.groups.find((g) => g.id === evaluation.groupId);

            if (!evaluation.scores) return;

            Object.entries(evaluation.scores).forEach(([studentId, score]) => {
                const student = this.state.students.find((s) => s.id === studentId);
                if (!student) return;

                // Calculate additional marks
                let additionalMarks = 0;
                if (score.optionMarks) {
                    Object.values(score.optionMarks).forEach((opt) => {
                        if (opt.selected) {
                            const optDef = this.evaluationOptions?.find(
                                (o) => o.id === opt.optionId
                            );
                            if (optDef) additionalMarks += optDef.marks || 0;
                        }
                    });
                }

                const totalScore =
                    (score.taskScore || 0) +
                    (score.teamworkScore || 0) +
                    additionalMarks;

                csvData.push([
                    task?.name || "Unknown",
                    group?.name || "Unknown",
                    student.name,
                    score.taskScore || 0,
                    score.teamworkScore || 0,
                    additionalMarks,
                    totalScore,
                    score.comments || "",
                ]);
            });
        });

        // ✅ CSV তৈরি UTF-8 + BOM সহ
        const BOM = "\uFEFF";
        const csvContent =
            BOM +
            [headers, ...csvData]
                .map((row) =>
                    row
                        .map((cell) =>
                            `"${String(cell).replace(/"/g, '""')}"`
                        )
                        .join(",")
                )
                .join("\n");

        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });

        this.downloadBlob(blob, "মূল্যায়ন_তথ্য.csv");
        this.showToast("মূল্যায়ন ডেটা সফলভাবে এক্সপোর্ট হয়েছে ✅", "success");
    } catch (error) {
        console.error("Export error:", error);
        this.showToast("এক্সপোর্ট ব্যর্থ: " + (error.message || "অজানা ত্রুটি"), "error");
    } finally {
        this.hideLoading();
    }
}


// Enhanced HTML view for better print experience
createPrintPreview(groupId = null) {
    const group = groupId ? this.state.groups.find(g => g.id === groupId) : null;
    const groupsToShow = group ? [group] : this.state.groups.filter(g => 
        this.state.evaluations.some(e => e.groupId === g.id)
    );

    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>গ্রুপ বিশ্লেষণ রিপোর্ট</title>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&display=swap');
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Hind Siliguri', 'SolaimanLipi', sans-serif;
                    line-height: 1.4;
                    color: #1e293b;
                    background: #ffffff;
                    padding: 20px;
                    font-size: 14px;
                }
                
                .a4-page {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                    padding: 20mm;
                    background: white;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                
                .print-header {
                    text-align: center;
                    margin-bottom: 25px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #3b82f6;
                }
                
                .print-title {
                    font-size: 28px;
                    font-weight: 700;
                    color: #1e40af;
                    margin-bottom: 8px;
                }
                
                .print-subtitle {
                    font-size: 16px;
                    color: #64748b;
                    margin-bottom: 10px;
                }
                
                .print-meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #94a3b8;
                }
                
                .group-header {
                    background: linear-gradient(135deg, #3b82f6, #1e40af);
                    color: white;
                    padding: 20px;
                    border-radius: 12px;
                    margin-bottom: 25px;
                    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.2);
                }
                
                .group-name {
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 8px;
                }
                
                .group-info {
                    font-size: 14px;
                    opacity: 0.9;
                }
                
                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 12px;
                    margin-bottom: 25px;
                }
                
                .metric-card {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 15px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    transition: transform 0.2s;
                }
                
                .metric-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                
                .metric-icon {
                    font-size: 24px;
                    margin-bottom: 8px;
                }
                
                .metric-value {
                    font-size: 20px;
                    font-weight: 700;
                    margin-bottom: 4px;
                }
                
                .metric-label {
                    font-size: 12px;
                    color: #64748b;
                }
                
                .section-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #1e293b;
                    margin: 25px 0 15px 0;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #e2e8f0;
                }
                
                .student-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    font-size: 12px;
                }
                
                .student-table th {
                    background: #3b82f6;
                    color: white;
                    padding: 12px 8px;
                    text-align: left;
                    font-weight: 600;
                }
                
                .student-table td {
                    padding: 10px 8px;
                    border-bottom: 1px solid #f1f5f9;
                }
                
                .student-table tr:nth-child(even) {
                    background: #f8fafc;
                }
                
                .student-table tr:hover {
                    background: #f1f5f9;
                }
                
                .status-excellent { color: #10b981; font-weight: 600; }
                .status-good { color: #f59e0b; font-weight: 600; }
                .status-poor { color: #ef4444; font-weight: 600; }
                
                .task-performance {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 12px;
                    margin-bottom: 20px;
                }
                
                .task-card {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 15px;
                }
                
                .task-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                
                .task-name {
                    font-weight: 600;
                    color: #1e293b;
                }
                
                .task-score {
                    font-weight: 700;
                }
                
                .progress-bar {
                    width: 100%;
                    height: 6px;
                    background: #e2e8f0;
                    border-radius: 3px;
                    overflow: hidden;
                }
                
                .progress-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.3s ease;
                }
                
                .role-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 12px;
                    margin-bottom: 25px;
                }
                
                .role-card {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                }
                
                .role-name {
                    font-weight: 600;
                    color: #1e293b;
                    margin-bottom: 8px;
                }
                
                .role-stats {
                    font-size: 12px;
                    color: #64748b;
                }
                
                .print-footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 15px;
                    border-top: 1px solid #e2e8f0;
                    color: #94a3b8;
                    font-size: 11px;
                }
                
                @media print {
                    body {
                        padding: 0;
                        background: white;
                    }
                    
                    .a4-page {
                        width: 100%;
                        min-height: 100%;
                        margin: 0;
                        padding: 15mm;
                        box-shadow: none;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                    
                    @page {
                        margin: 15mm;
                        size: A4;
                    }
                }
            </style>
        </head>
        <body>
            <div class="a4-page">
                ${this.generatePrintViewContent(groupsToShow)}
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
}

generatePrintViewContent(groups) {
    let content = '';
    
    groups.forEach((group, groupIndex) => {
        if (groupIndex > 0) {
            content += '<div style="page-break-before: always;"></div>';
        }
        
        const groupStudents = this.state.students.filter(s => s.groupId === group.id);
        const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
        const stats = this.calculateGroupComprehensiveStats(group.id, groupStudents, groupEvaluations);
        
        content += `
            <!-- Header -->
            <div class="print-header">
                <div class="print-title">গ্রুপ বিশ্লেষণ রিপোর্ট</div>
                <div class="print-subtitle">স্মার্ট ইভ্যালুয়েটর সিস্টেম</div>
                <div class="print-meta">
                    <span>প্রস্তুতকৃত: ${new Date().toLocaleDateString('bn-BD')}</span>
                    <span>পৃষ্ঠা: ${groupIndex + 1}</span>
                </div>
            </div>
            
            <!-- Group Header -->
            <div class="group-header">
                <div class="group-name">${group.name}</div>
                <div class="group-info">সদস্য: ${stats.memberCount} জন | মোট মূল্যায়ন: ${stats.evaluationCount} টি | গড় স্কোর: ${stats.overallAverage.toFixed(2)}</div>
            </div>
            
            <!-- Key Metrics -->
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-icon">📊</div>
                    <div class="metric-value">${stats.overallAverage.toFixed(2)}</div>
                    <div class="metric-label">গড় স্কোর</div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon">🎯</div>
                    <div class="metric-value">${stats.maxScore.toFixed(2)}</div>
                    <div class="metric-label">সর্বোচ্চ স্কোর</div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon">📉</div>
                    <div class="metric-value">${stats.minScore.toFixed(2)}</div>
                    <div class="metric-label">ন্যূনতম স্কোর</div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon">👥</div>
                    <div class="metric-value">${stats.studentPerformance.length}</div>
                    <div class="metric-label">সক্রিয় সদস্য</div>
                </div>
            </div>
        `;
        
        // Student Performance
        if (stats.studentPerformance.length > 0) {
            content += `
                <div class="section-title">শিক্ষার্থীদের পারফরম্যান্স</div>
                <table class="student-table">
                    <thead>
                        <tr>
                            <th>নাম</th>
                            <th>দায়িত্ব</th>
                            <th>গড় স্কোর</th>
                            <th>মূল্যায়ন</th>
                            <th>স্ট্যাটাস</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            stats.studentPerformance.slice(0, 10).forEach(student => {
                const status = student.averageScore >= 80 ? "Excellent" : 
                              student.averageScore >= 60 ? "Good" : "Needs Improvement";
                const statusClass = student.averageScore >= 80 ? "status-excellent" : 
                                   student.averageScore >= 60 ? "status-good" : "status-poor";
                
                content += `
                    <tr>
                        <td>${student.name}</td>
                        <td>${student.roleName}</td>
                        <td>${student.averageScore.toFixed(2)}</td>
                        <td>${student.evaluationCount}</td>
                        <td class="${statusClass}">${status}</td>
                    </tr>
                `;
            });
            
            content += `
                    </tbody>
                </table>
            `;
        }
        
        // Task Performance
        if (stats.taskPerformance.length > 0) {
            content += `
                <div class="section-title">টাস্ক পারফরম্যান্স</div>
                <div class="task-performance">
            `;
            
            stats.taskPerformance.slice(0, 4).forEach(task => {
                const progressColor = task.averageScore >= 80 ? '#10b981' : 
                                    task.averageScore >= 60 ? '#f59e0b' : '#ef4444';
                
                content += `
                    <div class="task-card">
                        <div class="task-header">
                            <div class="task-name">${task.taskName}</div>
                            <div class="task-score">${task.averageScore.toFixed(1)}</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${task.averageScore}%; background: ${progressColor};"></div>
                        </div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 8px;">
                            সর্বোচ্চ: ${task.maxScore.toFixed(1)} | সর্বনিম্ন: ${task.minScore.toFixed(1)} | অংশগ্রহণ: ${task.participants}
                        </div>
                    </div>
                `;
            });
            
            content += `</div>`;
        }
        
        // Role Performance
        if (stats.rolePerformance.length > 0) {
            content += `
                <div class="section-title">দায়িত্ব অনুযায়ী পারফরম্যান্স</div>
                <div class="role-grid">
            `;
            
            stats.rolePerformance.forEach(role => {
                content += `
                    <div class="role-card">
                        <div class="role-name">${role.roleName}</div>
                        <div class="role-stats">
                            গড় স্কোর: ${role.averageScore.toFixed(2)}<br>
                            সদস্য: ${role.count} জন
                        </div>
                    </div>
                `;
            });
            
            content += `</div>`;
        }
        
        // Footer
        content += `
            <div class="print-footer">
                স্বয়ংক্রিয়ভাবে প্রস্তুতকৃত - স্মার্ট ইভ্যালুয়েটর সিস্টেম
            </div>
        `;
    });
    
    return content;
}


// ===============================
// ENHANCED PRINT SYSTEM WITH BENGALI SUPPORT
// ===============================

generateProfessionalPDF(groupId = null) {
    this.showLoading("পেশাদার PDF রিপোর্ট তৈরি হচ্ছে...");
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        // A4 page dimensions
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 15;
        let yPosition = margin;

        // Add professional header
        yPosition = this.addProfessionalHeader(doc, yPosition, pageWidth, margin);
        
        // Process groups
        const groupsToProcess = groupId 
            ? [this.state.groups.find(g => g.id === groupId)].filter(Boolean)
            : this.state.groups.filter(group => {
                const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
                return groupEvaluations.length > 0;
            });

        if (groupsToProcess.length === 0) {
            this.showToast("PDF তৈরি করার জন্য কোন ডেটা পাওয়া যায়নি", "error");
            this.hideLoading();
            return;
        }

        // Generate content for each group
        for (let i = 0; i < groupsToProcess.length; i++) {
            const group = groupsToProcess[i];
            
            if (i > 0) {
                doc.addPage();
                yPosition = margin;
                yPosition = this.addProfessionalHeader(doc, yPosition, pageWidth, margin, true);
            }

            // Generate single page group analysis
            yPosition = this.generateSinglePageGroupAnalysis(doc, group, yPosition, pageWidth, margin, pageHeight);
        }

        // Save PDF
        const fileName = groupId 
            ? `${this.state.groups.find(g => g.id === groupId)?.name || 'group'}_analysis.pdf`
            : `complete_analysis_${new Date().toISOString().split('T')[0]}.pdf`;
        
        doc.save(fileName);
        this.showToast("পেশাদার PDF রিপোর্ট তৈরি সম্পন্ন", "success");
        
    } catch (error) {
        console.error("PDF generation error:", error);
        this.showToast("PDF তৈরি করতে সমস্যা: " + error.message, "error");
    } finally {
        this.hideLoading();
    }
}

addProfessionalHeader(doc, yPosition, pageWidth, margin, isContinued = false) {
    // Main title with gradient effect simulation
    doc.setFillColor(59, 130, 246, 0.1);
    doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 25, 3, 3, 'F');
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text("গ্রুপ বিশ্লেষণ রিপোর্ট", pageWidth / 2, yPosition + 15, { align: 'center' });
    
    yPosition += 30;

    // Subtitle and info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    
    const title = isContinued ? "রিপোর্টের ধারাবাহিকতা" : "বিস্তারিত গ্রুপ পারফরম্যান্স বিশ্লেষণ";
    doc.text(title, margin, yPosition);
    doc.text(`প্রস্তুতকৃত: ${new Date().toLocaleDateString('bn-BD')}`, pageWidth - margin, yPosition, { align: 'right' });
    
    yPosition += 5;
    
    // Separator
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    
    yPosition += 10;

    return yPosition;
}

generateSinglePageGroupAnalysis(doc, group, yPosition, pageWidth, margin, pageHeight) {
    const groupStudents = this.state.students.filter(s => s.groupId === group.id);
    const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
    const stats = this.calculateGroupComprehensiveStats(group.id, groupStudents, groupEvaluations);

    // Group title section
    yPosition = this.addGroupTitleSection(doc, group, yPosition, pageWidth, margin);
    
    // Key metrics in a compact grid
    yPosition = this.addKeyMetricsGrid(doc, stats, yPosition, pageWidth, margin);
    
    // Student performance table (compact)
    if (stats.studentPerformance.length > 0) {
        yPosition = this.addCompactStudentTable(doc, stats.studentPerformance, yPosition, pageWidth, margin, pageHeight);
    }
    
    // Task performance highlights
    if (stats.taskPerformance.length > 0 && yPosition < pageHeight - 60) {
        yPosition = this.addTaskPerformanceHighlights(doc, stats.taskPerformance, yPosition, pageWidth, margin);
    }
    
    // Role performance summary
    if (stats.rolePerformance.length > 0 && yPosition < pageHeight - 40) {
        yPosition = this.addRolePerformanceSummary(doc, stats.rolePerformance, yPosition, pageWidth, margin);
    }
    
    // Footer
    this.addPageFooter(doc, pageWidth, pageHeight, margin);
    
    return yPosition;
}

addGroupTitleSection(doc, group, yPosition, pageWidth, margin) {
    // Group name with background
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 20, 3, 3, 'F');
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text(`গ্রুপ: ${group.name}`, margin + 10, yPosition + 12);
    
    // Group info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    
    const groupStudents = this.state.students.filter(s => s.groupId === group.id);
    const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
    
    doc.text(`সদস্য: ${groupStudents.length} জন | মূল্যায়ন: ${groupEvaluations.length} টি`, pageWidth - margin - 10, yPosition + 12, { align: 'right' });
    
    return yPosition + 25;
}

addKeyMetricsGrid(doc, stats, yPosition, pageWidth, margin) {
    const metrics = [
        { 
            label: "গড় স্কোর", 
            value: stats.overallAverage.toFixed(2),
            color: [34, 197, 94],
            icon: "📊"
        },
        { 
            label: "সর্বোচ্চ স্কোর", 
            value: stats.maxScore.toFixed(2),
            color: [59, 130, 246],
            icon: "🎯"
        },
        { 
            label: "ন্যূনতম স্কোর", 
            value: stats.minScore.toFixed(2),
            color: [239, 68, 68],
            icon: "📉"
        },
        { 
            label: "সক্রিয় সদস্য", 
            value: stats.studentPerformance.length,
            color: [168, 85, 247],
            icon: "👥"
        }
    ];

    const boxWidth = (pageWidth - 2 * margin - 15) / 4;
    const boxHeight = 35;

    metrics.forEach((metric, index) => {
        const x = margin + index * (boxWidth + 5);
        
        // Metric box
        doc.setFillColor(...metric.color, 0.1);
        doc.roundedRect(x, yPosition, boxWidth, boxHeight, 5, 5, 'F');
        
        doc.setDrawColor(...metric.color);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, yPosition, boxWidth, boxHeight, 5, 5);
        
        // Icon
        doc.setFontSize(12);
        doc.text(metric.icon, x + 8, yPosition + 10);
        
        // Value
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...metric.color);
        doc.text(metric.value, x + boxWidth / 2, yPosition + 22, { align: 'center' });
        
        // Label
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(metric.label, x + boxWidth / 2, yPosition + 28, { align: 'center' });
    });

    return yPosition + boxHeight + 10;
}

addCompactStudentTable(doc, studentPerformance, yPosition, pageWidth, margin, pageHeight) {
    // Section title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("শিক্ষার্থীদের পারফরম্যান্স সংক্ষিপ্তসার", margin, yPosition);
    yPosition += 8;

    // Table header
    doc.setFillColor(59, 130, 246, 0.2);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
    
    const columns = [
        { header: "নাম", width: 45 },
        { header: "দায়িত্ব", width: 35 },
        { header: "গড় স্কোর", width: 25 },
        { header: "স্ট্যাটাস", width: 25 }
    ];

    // Header text
    let x = margin + 2;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    
    columns.forEach(col => {
        doc.text(col.header, x, yPosition + 5);
        x += col.width;
    });

    yPosition += 8;

    // Student rows (compact)
    doc.setFontSize(8);
    studentPerformance.slice(0, 8).forEach((student, index) => { // Limit to 8 students
        if (yPosition > pageHeight - 20) return;

        // Alternate background
        if (index % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, yPosition, pageWidth - 2 * margin, 6, 'F');
        }

        x = margin + 2;
        
        // Name (truncated)
        const name = student.name.length > 15 ? student.name.substring(0, 12) + '...' : student.name;
        doc.setTextColor(30, 41, 59);
        doc.text(name, x, yPosition + 4);
        x += columns[0].width;
        
        // Role
        const role = student.roleName.length > 10 ? student.roleName.substring(0, 8) + '...' : student.roleName;
        doc.text(role, x, yPosition + 4);
        x += columns[1].width;
        
        // Average score
        doc.text(student.averageScore.toFixed(1), x, yPosition + 4);
        x += columns[2].width;
        
        // Status with color
        const status = student.averageScore >= 80 ? "Excellent" : 
                      student.averageScore >= 60 ? "Good" : "Improve";
        const statusColor = student.averageScore >= 80 ? [34, 197, 94] : 
                           student.averageScore >= 60 ? [234, 179, 8] : [239, 68, 68];
        
        doc.setTextColor(...statusColor);
        doc.text(status, x, yPosition + 4);

        yPosition += 6;
    });

    // Show more indicator if there are more students
    if (studentPerformance.length > 8) {
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`+ ${studentPerformance.length - 8} জন আরও...`, margin, yPosition + 4);
        yPosition += 8;
    } else {
        yPosition += 5;
    }

    return yPosition;
}

addTaskPerformanceHighlights(doc, taskPerformance, yPosition, pageWidth, margin) {
    // Section title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("টাস্ক পারফরম্যান্স হাইলাইটস", margin, yPosition);
    yPosition += 8;

    // Show top 3 tasks
    const topTasks = taskPerformance.slice(0, 3);
    
    topTasks.forEach((task, index) => {
        if (index > 0) yPosition += 2;
        
        const barWidth = 80;
        const scorePercent = (task.averageScore / 100) * barWidth;
        
        // Task name and score
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        
        const taskName = task.taskName.length > 25 ? task.taskName.substring(0, 22) + '...' : task.taskName;
        doc.text(taskName, margin, yPosition + 4);
        doc.text(task.averageScore.toFixed(1), margin + barWidth + 5, yPosition + 4);
        
        // Progress bar background
        doc.setFillColor(226, 232, 240);
        doc.rect(margin, yPosition + 6, barWidth, 4, 'F');
        
        // Progress bar fill
        const barColor = task.averageScore >= 80 ? [34, 197, 94] : 
                        task.averageScore >= 60 ? [234, 179, 8] : [239, 68, 68];
        doc.setFillColor(...barColor);
        doc.rect(margin, yPosition + 6, scorePercent, 4, 'F');
        
        yPosition += 12;
    });

    return yPosition + 5;
}

addRolePerformanceSummary(doc, rolePerformance, yPosition, pageWidth, margin) {
    // Section title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("দায়িত্ব অনুযায়ী পারফরম্যান্স", margin, yPosition);
    yPosition += 8;

    // Role performance in a small grid
    const rolesPerRow = 2;
    const roleWidth = (pageWidth - 2 * margin - 10) / rolesPerRow;
    let x = margin;

    rolePerformance.forEach((role, index) => {
        if (index > 0 && index % rolesPerRow === 0) {
            x = margin;
            yPosition += 20;
        }

        // Role card
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(x, yPosition, roleWidth, 18, 3, 3, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, yPosition, roleWidth, 18, 3, 3);

        // Role name
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        
        const roleName = role.roleName.length > 15 ? role.roleName.substring(0, 12) + '...' : role.roleName;
        doc.text(roleName, x + 5, yPosition + 6);

        // Performance info
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`স্কোর: ${role.averageScore.toFixed(1)}`, x + 5, yPosition + 11);
        doc.text(`সদস্য: ${role.count}`, x + 5, yPosition + 15);

        x += roleWidth + 5;
    });

    return yPosition + 25;
}

addPageFooter(doc, pageWidth, pageHeight, margin) {
    // Footer separator
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    
    // Footer text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    
    const footerText = "স্মার্ট ইভ্যালুয়েটর সিস্টেম - স্বয়ংক্রিয়ভাবে প্রস্তুতকৃত";
    doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // Page number
    doc.text(`পৃষ্ঠা ${doc.internal.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
}



// ===============================
// SECURE FILE DOWNLOAD HELPER
// ===============================
downloadBlob(blob, filename) {
    try {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        this.showToast(`ফাইল ডাউনলোড শুরু হয়েছে: ${filename}`, "info");

        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 800);
    } catch (error) {
        console.error("Download error:", error);
        this.showToast("ফাইল ডাউনলোডে সমস্যা হয়েছে", "error");
    }
}

    // ===============================
    // POPULATE SELECTS
    // ===============================
    populateSelects() {
        this.populateGroupSelects();
        this.populateTaskSelects();
    }

    populateGroupSelects() {
        const groupSelects = [
            "studentGroupInput",
            "membersFilterGroup",
            "cardsFilterGroup",
            "groupMembersGroupSelect",
            "analysisGroupSelect",
            "evaluationGroupSelect",
        ];

        groupSelects.forEach((selectId) => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = `
                    <option value="">সকল গ্রুপ</option>
                    ${this.state.groups
                        .map((g) => `<option value="${g.id}">${g.name}</option>`)
                        .join("")}
                `;
            }
        });
    }

    populateTaskSelects() {
        const taskSelects = ["evaluationTaskSelect"];

        taskSelects.forEach((selectId) => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = `
                    <option value="">টাস্ক নির্বাচন করুন</option>
                    ${this.state.tasks
                        .map((t) => `<option value="${t.id}">${t.name}</option>`)
                        .join("")}
                `;
            }
        });
    }

    // ===============================
    // POLICY SECTION TOGGLE
    // ===============================
    togglePolicySection(index) {
        const content = document.getElementById(`policyContent-${index}`);
        const icon = document.getElementById(`policyIcon-${index}`);

        if (content && icon) {
            content.classList.toggle("hidden");
            icon.classList.toggle("rotate-180");
        }
    }

    // ===============================
    // GROUP DETAILS MODAL
    // ===============================
    showGroupDetailsModal(groupId) {
        const group = this.state.groups.find((g) => g.id === groupId);
        if (!group) return;

        if (this.dom.groupDetailsTitle) {
            this.dom.groupDetailsTitle.textContent = `${group.name} - বিস্তারিত বিশ্লেষণ`;
        }

        this.renderGroupDetails(groupId);
        this.showModal(this.dom.groupDetailsModal);
    }

    hideGroupDetailsModal() {
        this.hideModal(this.dom.groupDetailsModal);
    }

    // ===============================
    // REFRESH RANKING
    // ===============================
    refreshRanking() {
        this.renderStudentRanking();
        this.showToast("র‌্যাঙ্কিং রিফ্রেশ করা হয়েছে", "success");
    }

    // ===============================
    // AUTH FORM TOGGLE
    // ===============================
   // Update the toggleAuthForms method to handle admin type visibility
toggleAuthForms(showRegister = true) {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const adminTypeSelect = document.getElementById("adminType");

    if (loginForm && registerForm) {
        if (showRegister) {
            loginForm.classList.add("hidden");
            registerForm.classList.remove("hidden");
            
            // Hide super-admin option for public registration
            if (adminTypeSelect) {
                // Remove super-admin option if it exists
                const superAdminOption = adminTypeSelect.querySelector('option[value="super-admin"]');
                if (superAdminOption) {
                    superAdminOption.remove();
                }
                
                // If user is logged in as super-admin, show all options
                if (this.currentUserData?.type === "super-admin") {
                    // Add super-admin option back
                    if (!adminTypeSelect.querySelector('option[value="super-admin"]')) {
                        const superAdminOption = document.createElement('option');
                        superAdminOption.value = "super-admin";
                        superAdminOption.textContent = "সুপার অ্যাডমিন";
                        adminTypeSelect.appendChild(superAdminOption);
                    }
                }
            }
        } else {
            loginForm.classList.remove("hidden");
            registerForm.classList.add("hidden");
        }
    }
}
}

// Initialize the application
let smartEvaluator;

document.addEventListener("DOMContentLoaded", function () {
    smartEvaluator = new SmartGroupEvaluator();
});