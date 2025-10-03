// app.js - COMPLETE PROFESSIONAL VERSION WITH ALL FIXES
class CacheManager {
    constructor() {
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        this.PREFIX = "smart_evaluator_";
        this.forceRefresh = false;
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

        this.PUBLIC_PAGES = [
            "dashboard",
            "all-students",
            "group-policy",
            "export",
            "student-ranking",
            "group-analysis",
        ];
        this.PRIVATE_PAGES = [
            "groups",
            "members",
            "group-members",
            "tasks",
            "evaluation",
            "admin-management",
        ];

        this.evaluationOptions = [
            { id: "cannot_do", text: "আমি এই টপিক এখনো পারিনা", marks: -5 },
            {
                id: "learned_cannot_write",
                text: "আমি এই টপিক শুধুমাত্র বুঝেছি কিন্তু ভালো করে শেখা হয়নি",
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
                marks: 5,
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
                content: "১. নির্দিষ্ট কাজ সময়মতো করা\n২. গ্রুপ মিটিং এ উপস্থিত থাকা\n৩. অন্যান্য সদস্যদের সহযোগিতা করা\n৪. সমস্যা হলে লিডারকে জানানো\n৫. গ্রুপের উন্নতির জন্য পরামর্শ দেওয়া",
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

// optimiseMain.js - class-এর ভিতরে এই মেথড যোগ করুন
debugAuthState() {
    console.log("=== AUTH DEBUG INFO ===");
    console.log("Current User:", this.currentUser);
    console.log("Current User Data:", this.currentUserData);
    console.log("Is Public Mode:", this.isPublicMode);
    console.log("DOM Elements Status:", {
        headerLoginBtn: {
            element: !!this.dom.headerLoginBtn,
            hidden: this.dom.headerLoginBtn?.classList.contains("hidden")
        },
        logoutBtn: {
            element: !!this.dom.logoutBtn,
            hidden: this.dom.logoutBtn?.classList.contains("hidden")
        },
        userInfo: {
            element: !!this.dom.userInfo,
            content: this.dom.userInfo?.innerHTML
        },
        appContainer: {
            element: !!this.dom.appContainer,
            hidden: this.dom.appContainer?.classList.contains("hidden")
        },
        authModal: {
            element: !!this.dom.authModal,
            hidden: this.dom.authModal?.classList.contains("hidden")
        }
    });
    
    // Navigation buttons status
    const navStatus = {};
    this.dom.navBtns.forEach(btn => {
        const pageId = btn.getAttribute("data-page");
        navStatus[pageId] = {
            disabled: btn.disabled,
            opacity: btn.style.opacity,
            pointerEvents: btn.style.pointerEvents,
            hasDisabledClass: btn.classList.contains("disabled-nav")
        };
    });
    console.log("Navigation Status:", navStatus);
}

// init মেথডে call করুন
async init() {
    // ... existing code ...
    
    // Debug info
    setTimeout(() => {
        this.debugAuthState();
    }, 2000);
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
}
// optimiseMain.js - setupAuthStateListener মেথডে এই correction করুন
setupAuthStateListener() {
    auth.onAuthStateChanged(async (user) => {
        console.log("Auth State Changed:", user ? "Logged in" : "Logged out");
        
        if (user) {
            try {
                console.log("User logged in:", user.email);
                this.currentUser = user;
                
                // User data fetch করুন
                const userData = await this.getUserAdminData(user);
                this.currentUserData = userData;
                
                console.log("User data loaded:", userData);
                
                // Successful login handle করুন
                await this.handleSuccessfulLogin(user);
            } catch (error) {
                console.error("Error in auth state change:", error);
                // Error হলে logout handle করুন
                await this.handleLogout();
            }
        } else {
            console.log("User logged out");
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
            mobileMenuBtn: document.getElementById("mobileMenuBtn"),
            sidebar: document.querySelector(".sidebar"),
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
        };
    }

    setupEventListeners() {
        // Header login button
        this.addListener(this.dom.loginHeaderBtn, "click", () => this.showAuthModal());
        
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
        this.addListener(this.dom.mobileMenuBtn, "click", () => this.toggleMobileMenu());

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

// optimiseMain.js - handleSuccessfulLogin মেথডে এই correction করুন
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
        const adminType = document.getElementById("adminType")?.value;

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

            await db.collection("admins").doc(user.uid).set({
                email,
                type: adminType || "user",
                permissions: {
                    read: true,
                    write: adminType === "super-admin" || adminType === "admin",
                    delete: adminType === "super-admin",
                },
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
        
        try {
            // First try cache
            const cached = this.cache.get(cacheKey);
            if (cached) {
                console.log("Admin data from cache:", cached);
                return cached;
            }

            // If not in cache, fetch from Firestore
            const adminDoc = await db.collection("admins").doc(user.uid).get();
            console.log("Admin document fetch result:", adminDoc.exists);
            
            if (adminDoc.exists) {
                const data = adminDoc.data();
                console.log("Admin data retrieved from Firestore:", data);
                this.cache.set(cacheKey, data);
                return data;
            } else {
                console.log("No admin document found for user:", user.uid);
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
                this.cache.set(cacheKey, basicData);
                return basicData;
            }
        } catch (error) {
            console.error("Error fetching admin data:", error);
            
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

        // Check authentication for private pages
        if (!this.currentUser && this.PRIVATE_PAGES.includes(pageId)) {
            this.showToast("এই পেজ দেখতে লগইন প্রয়োজন", "error");
            this.showAuthModal();
            return;
        }

        // For logged-in users, check role-based access
        if (this.currentUser) {
            const userRole = this.currentUserData?.type;
            
            if (pageId === "admin-management" && userRole !== "super-admin") {
                this.showToast("এই পেজ এক্সেস করতে সুপার অ্যাডমিন权限 প্রয়োজন", "error");
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
            }
        } catch (error) {
            console.error(`Error loading page ${pageId}:`, error);
            this.showToast(`পেজ লোড করতে সমস্যা: ${pageId}`, "error");
        }
    }
// optimiseMain.js - enableAllNavigation মেথডে এই correction করুন
enableAllNavigation(isLoggedIn) {
    console.log("Enabling navigation for:", isLoggedIn ? "Logged in" : "Logged out");
    
    this.dom.navBtns.forEach((btn) => {
        const pageId = btn.getAttribute("data-page");
        
        if (isLoggedIn && this.currentUserData) {
            // User is logged in AND has user data
            const userRole = this.currentUserData.type;
            
            console.log(`Checking access for page: ${pageId}, user role: ${userRole}`);
            
            if (userRole === "super-admin") {
                // Super Admin - সকল page access
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
                btn.disabled = false;
                btn.classList.remove("disabled-nav");
            } else if (userRole === "admin") {
                // Admin - admin-management বাদে সকল page
                if (pageId === "admin-management") {
                    btn.style.opacity = "0.5";
                    btn.style.pointerEvents = "none";
                    btn.disabled = true;
                    btn.classList.add("disabled-nav");
                } else {
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "auto";
                    btn.disabled = false;
                    btn.classList.remove("disabled-nav");
                }
            } else {
                // Regular user - শুধু public pages
                if (this.PUBLIC_PAGES.includes(pageId)) {
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "auto";
                    btn.disabled = false;
                    btn.classList.remove("disabled-nav");
                } else {
                    btn.style.opacity = "0.5";
                    btn.style.pointerEvents = "none";
                    btn.disabled = true;
                    btn.classList.add("disabled-nav");
                }
            }
        } else {
            // Not logged in - শুধু public pages
            if (this.PUBLIC_PAGES.includes(pageId)) {
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
                btn.disabled = false;
                btn.classList.remove("disabled-nav");
            } else {
                btn.style.opacity = "0.5";
                btn.style.pointerEvents = "none";
                btn.disabled = true;
                btn.classList.add("disabled-nav");
            }
        }
    });
}

// optimiseMain.js - updateUserInterface মেথডে এই correction করুন
updateUserInterface(userData) {
    if (!this.dom.userInfo || !this.dom.logoutBtn || !this.dom.headerLoginBtn) {
        console.error("DOM elements not found for UI update");
        return;
    }

    console.log("Updating UI with user data:", userData);

    if (userData && this.currentUser) {
        // User is logged in
        const roleText = userData.type === "super-admin" ? "সুপার অ্যাডমিন" : 
                        userData.type === "admin" ? "অ্যাডমিন" : "সাধারণ ব্যবহারকারী";
        
        const roleColor = userData.type === "super-admin" ? "text-purple-600" : 
                         userData.type === "admin" ? "text-blue-600" : "text-green-600";

        this.dom.userInfo.innerHTML = `
            <div class="font-medium">${userData.email}</div>
            <div class="text-xs ${roleColor}">${roleText}</div>
        `;

        // Show logout button, hide login button
        this.dom.logoutBtn.classList.remove("hidden");
        this.dom.headerLoginBtn.classList.add("hidden");
        
        console.log("UI updated for logged in user");

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
        if (!this.currentUser || this.currentUserData?.type !== "super-admin") {
            console.log("User not authorized to load admins");
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

    showAdminModal(admin = null) {
        // Check if current user is super-admin
        if (this.currentUserData?.type !== "super-admin") {
            this.showToast("শুধুমাত্র সুপার অ্যাডমিন অ্যাডমিন ম্যানেজ করতে পারেন", "error");
            return;
        }

        this.dom.adminModalTitle.textContent = admin ? "অ্যাডমিন সম্পাদনা" : "নতুন অ্যাডমিন যোগ করুন";

        if (admin) {
            // Editing existing admin
            this.dom.adminEmail.value = admin.email;
            this.dom.adminPassword.value = ""; // Don't show existing password
            this.dom.adminPassword.placeholder = "পাসওয়ার্ড পরিবর্তন করতে এখানে লিখুন";
            this.dom.adminTypeSelect.value = admin.type;
            
            // Set permissions
            this.dom.permissionRead.checked = admin.permissions?.read || false;
            this.dom.permissionWrite.checked = admin.permissions?.write || false;
            this.dom.permissionDelete.checked = admin.permissions?.delete || false;
            
            this.currentEditingAdmin = admin;
        } else {
            // Adding new admin
            this.dom.adminEmail.value = "";
            this.dom.adminPassword.value = "";
            this.dom.adminPassword.placeholder = "পাসওয়ার্ড লিখুন";
            this.dom.adminTypeSelect.value = "user";
            
            // Default permissions for new user
            this.dom.permissionRead.checked = true;
            this.dom.permissionWrite.checked = false;
            this.dom.permissionDelete.checked = false;
            
            this.currentEditingAdmin = null;
        }

        this.handleAdminTypeChange({ target: this.dom.adminTypeSelect });
        this.showModal(this.dom.adminModal);
    }

    handleAdminTypeChange(e) {
        const isSuperAdmin = e.target.value === "super-admin";
        if (this.dom.permissionsSection) {
            this.dom.permissionsSection.classList.toggle("hidden", !isSuperAdmin);
        }
    }

    async saveAdmin() {
        // Check if current user is super-admin
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

    toggleMobileMenu() {
        if (this.dom.sidebar) {
            this.dom.sidebar.classList.toggle("hidden");
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
                            this.currentUser
                                ? `
                            <button onclick="smartEvaluator.editGroup('${group.id}')" class="edit-group-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                            <button onclick="smartEvaluator.deleteGroup('${group.id}')" class="delete-group-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                        `
                                : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'
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
                    group?.name || "না"
                }</div>
                            <div class="text-sm text-gray-500">একাডেমিক: ${
                                student.academicGroup || "না"
                            } | সেশন: ${student.session || "না"}</div>
                        </div>
                        <div class="flex gap-2">
                            ${
                                this.currentUser
                                    ? `
                                <button onclick="smartEvaluator.editStudent('${student.id}')" class="edit-student-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                                <button onclick="smartEvaluator.deleteStudent('${student.id}')" class="delete-student-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                            `
                                    : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'
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
                            <p><i class="fas fa-users mr-2 text-green-500"></i> গ্রুপ: ${group?.name || "না"}</p>
                            <p><i class="fas fa-book mr-2 text-orange-500"></i> একাডেমিক: ${student.academicGroup || "না"}</p>
                            <p><i class="fas fa-calendar mr-2 text-blue-500"></i> সেশন: ${student.session || "না"}</p>
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
                        <div class="overflow-x-auto">
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
        this.showDeleteModal("এই শিক্ষার্থী ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("students").doc(id).delete();
                // Clear cache and reload data
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
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            ${sortedGroups.map((group, index) => {
              const rank = index + 1;
              const style = rankStyles[rank] || { gradient: "from-indigo-400 to-purple-500", text: "text-white", icon: "🏆", glow: "" };
              const delay = index * 150; // entrance delay in ms
      
              return `
                <div 
                  class="relative rounded-3xl p-8 cursor-pointer 
                         bg-gradient-to-br ${style.gradient} ${style.text} ${style.glow} 
                         transform transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl
                         opacity-0 translate-y-6 animate-slide-in"
                  style="animation-delay: ${delay}ms"
                  onclick="smartEvaluator.showGroupDetailsModal('${group.id}')"
                >
                  <!-- Rank Ribbon -->
                 <div class="absolute -top-6 left-1/2 transform -translate-x-1/2 
            bg-white/80 dark:bg-gray-800/70 
            rounded-full px-4 py-2 font-bold text-lg 
            shadow-md flex items-center justify-center">
  <span class="mr-1 text-3xl">${style.icon}</span> Rank ${rank}
</div>

      
                  <!-- Group Info -->
                  <h3 class="font-extrabold text-2xl mb-2 drop-shadow-sm">${group.name}</h3>
                  <p class="text-lg font-semibold">✨ স্কোর: ${scores[group.id].score.toFixed(2)}</p>
                  <p class="text-sm mt-1 opacity-90">👥 সদস্য: ${scores[group.id].members} জন</p>
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


// group ranking

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
 
// ===============================
// STUDENT RANKING - UPDATED WITH NEW CONDITIONS
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

// ===============================
// RANKING SEARCH FUNCTIONALITY
// ===============================
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
    renderGroupAnalysis() {
        if (!this.dom.analysisGroupSelect || !this.dom.groupAnalysisDetails) return;

        // Populate group select
        this.dom.analysisGroupSelect.innerHTML = `
            <option value="">সকল গ্রুপ</option>
            ${this.state.groups
                .map((g) => `<option value="${g.id}">${g.name}</option>`)
                .join("")}
        `;

        // Render initial analysis
        this.updateGroupAnalysis();
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
                                                    <span class="px-2 py-1 rounded text-xs ${
                                                        student.averageScore >= 80
                                                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                            : student.averageScore >= 60
                                                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                    }">
                                                        ${
                                                            student.averageScore >= 80
                                                                ? "চমৎকার"
                                                                : student.averageScore >=
                                                                    60
                                                                ? "ভাল"
                                                                : "সুযোগ আছে"
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

    calculateGroupComprehensiveStats(groupId, groupStudents, groupEvaluations) {
        const stats = {
            memberCount: groupStudents.length,
            evaluationCount: groupEvaluations.length,
            overallAverage: 0,
            maxScore: 0,
            minScore: Infinity,
            taskPerformance: [],
            rolePerformance: [],
            studentPerformance: [],
        };

        // Calculate student performances
        const studentScores = {};
        groupStudents.forEach((student) => {
            studentScores[student.id] = {
                name: student.name,
                roleName: this.roleNames[student.role] || "নির্ধারিত হয়নি",
                totalScore: 0,
                evaluationCount: 0,
                averageScore: 0,
            };
        });

        // Calculate scores from evaluations
        groupEvaluations.forEach((evalItem) => {
            if (!evalItem.scores) return;

            const task = this.state.tasks.find((t) => t.id === evalItem.taskId);
            let taskTotal = 0;
            let taskCount = 0;
            let taskMax = 0;
            let taskMin = Infinity;

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

                    // Update task statistics
                    taskTotal += total;
                    taskCount++;
                    taskMax = Math.max(taskMax, total);
                    taskMin = Math.min(taskMin, total);
                }
            });

            // Add task performance data
            if (taskCount > 0) {
                stats.taskPerformance.push({
                    taskName: task?.name || "Unknown Task",
                    averageScore: taskTotal / taskCount,
                    maxScore: taskMax,
                    minScore: taskMin === Infinity ? 0 : taskMin,
                    participants: taskCount,
                });
            }
        });

        // Calculate student averages and overall statistics
        let overallTotal = 0;
        let overallCount = 0;

        Object.values(studentScores).forEach((studentData) => {
            if (studentData.evaluationCount > 0) {
                studentData.averageScore =
                    studentData.totalScore / studentData.evaluationCount;
                stats.studentPerformance.push(studentData);

                overallTotal += studentData.averageScore;
                overallCount++;
                stats.maxScore = Math.max(stats.maxScore, studentData.averageScore);
                stats.minScore = Math.min(stats.minScore, studentData.averageScore);
            }
        });

        stats.overallAverage = overallCount > 0 ? overallTotal / overallCount : 0;
        stats.minScore = stats.minScore === Infinity ? 0 : stats.minScore;

        // Calculate role-wise performance
        const roleStats = {};
        stats.studentPerformance.forEach((student) => {
            const role = student.roleName;
            if (!roleStats[role]) {
                roleStats[role] = { total: 0, count: 0 };
            }
            roleStats[role].total += student.averageScore;
            roleStats[role].count++;
        });

        stats.rolePerformance = Object.entries(roleStats).map(([role, data]) => ({
            roleName: role,
            averageScore: data.total / data.count,
            count: data.count,
        }));

        return stats;
    }

    // ===============================
    // EVALUATION METHODS
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

        if (students.length === 0) {
            this.showToast("এই গ্রুপে কোনো শিক্ষার্থী নেই", "error");
            return;
        }

        // Check if evaluation already exists
        const existingEvaluation = this.state.evaluations.find(
            (e) => e.taskId === taskId && e.groupId === groupId
        );

        this.currentEvaluation = {
            id: existingEvaluation?.id || null,
            taskId,
            groupId,
            scores: existingEvaluation?.scores || {},
            isEditing: !!existingEvaluation,
        };

        this.renderEvaluationForm(task, group, students, existingEvaluation);
    }

    renderEvaluationForm(task, group, students, existingEvaluation) {
        if (!this.dom.evaluationForm) return;

        const isEditing = !!existingEvaluation;

        let formHTML = `
            <div class="evaluation-header bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">${
                    isEditing ? "মূল্যায়ন সম্পাদনা" : "নতুন মূল্যায়ন"
                }</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div>
                        <strong>টাস্ক:</strong> ${task.name}
                    </div>
                    <div>
                        <strong>গ্রুপ:</strong> ${group.name}
                    </div>
                    <div>
                        <strong>সর্বোচ্চ স্কোর:</strong> ${task.maxScore}
                    </div>
                    <div>
                        <strong>শিক্ষার্থী সংখ্যা:</strong> ${students.length}
                    </div>
                </div>
            </div>
            <div class="evaluation-body p-6 space-y-6">
        `;

        students.forEach((student) => {
            const existingScore = existingEvaluation?.scores?.[student.id] || {};
            const roleBadge = student.role
                ? `<span class="member-role-badge ${student.role}">${
                    this.roleNames[student.role]
                }</span>`
                : "";

            formHTML += `
                <div class="student-evaluation bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div class="flex justify-between items-center mb-4">
                        <div>
                            <h4 class="font-semibold text-lg text-gray-800 dark:text-white">${student.name} ${roleBadge}</h4>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                রোল: ${student.roll} | একাডেমিক: ${student.academicGroup}
                            </p>
                        </div>
                    </div>
                    
                    <!-- Task Score -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            টাস্ক স্কোর (০-${task.maxScore})
                        </label>
                        <input type="number" 
                               min="0" 
                               max="${task.maxScore}"
                               value="${existingScore.taskScore || ""}"
                               data-student="${student.id}" 
                               data-type="taskScore"
                               class="task-score-input w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                               placeholder="টাস্ক স্কোর লিখুন">
                    </div>
                    
                    <!-- Teamwork Score -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            টিমওয়ার্ক স্কোর (০-১০)
                        </label>
                        <input type="number" 
                               min="0" 
                               max="10"
                               value="${existingScore.teamworkScore || ""}"
                               data-student="${student.id}" 
                               data-type="teamworkScore"
                               class="teamwork-score-input w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                               placeholder="টিমওয়ার্ক স্কোর লিখুন">
                    </div>
                    
                    <!-- Additional Options -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            অতিরিক্ত পয়েন্ট
                        </label>
                        <div class="space-y-2">
            `;

            this.evaluationOptions.forEach((option) => {
                const existingOption =
                    existingScore.optionMarks?.[option.id]?.selected || false;
                formHTML += `
                    <label class="flex items-center">
                        <input type="checkbox" 
                               data-student="${student.id}" 
                               data-option="${option.id}"
                               ${existingOption ? "checked" : ""}
                               class="option-checkbox mr-3">
                        <span class="text-sm text-gray-700 dark:text-gray-300">
                            ${option.text} (${option.marks > 0 ? "+" : ""}${
                    option.marks
                } পয়েন্ট)
                        </span>
                    </label>
                `;
            });

            formHTML += `
                        </div>
                    </div>
                    
                    <!-- Comments -->
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                            মন্তব্য
                        </label>
                        <textarea data-student="${student.id}" 
                                  data-type="comments"
                                  class="comments-input w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                  placeholder="মন্তব্য লিখুন (ঐচ্ছিক)">${
                                    existingScore.comments || ""
                                }</textarea>
                    </div>
                </div>
            `;
        });

        formHTML += `
                <div class="evaluation-actions flex gap-4 justify-end pt-6 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onclick="smartEvaluator.cancelEvaluation()" 
                            class="cancel-evaluation-btn px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        বাতিল
                    </button>
                    <button type="button" onclick="smartEvaluator.saveEvaluation()" 
                            class="save-evaluation-btn px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                        ${isEditing ? "আপডেট" : "সংরক্ষণ"}
                    </button>
                </div>
            </div>
        `;

        this.dom.evaluationForm.innerHTML = formHTML;
        this.dom.evaluationForm.classList.remove("hidden");
    }

    cancelEvaluation() {
        this.currentEvaluation = null;
        if (this.dom.evaluationForm) {
            this.dom.evaluationForm.classList.add("hidden");
        }
    }

    async saveEvaluation() {
        if (!this.currentEvaluation) return;

        const { taskId, groupId, scores, id, isEditing } = this.currentEvaluation;

        // Validate all scores
        const task = this.state.tasks.find((t) => t.id === taskId);
        if (!task) {
            this.showToast("টাস্ক পাওয়া যায়নি", "error");
            return;
        }

        // Collect all scores from form
        const newScores = { ...scores };
        const students = this.getStudentsInGroup(groupId);

        let hasError = false;
        students.forEach((student) => {
            const taskScoreInput = document.querySelector(
                `[data-student="${student.id}"][data-type="taskScore"]`
            );
            const teamworkScoreInput = document.querySelector(
                `[data-student="${student.id}"][data-type="teamworkScore"]`
            );
            const commentsInput = document.querySelector(
                `[data-student="${student.id}"][data-type="comments"]`
            );

            const taskScore = taskScoreInput ? parseInt(taskScoreInput.value) : 0;
            const teamworkScore = teamworkScoreInput
                ? parseInt(teamworkScoreInput.value)
                : 0;
            const comments = commentsInput ? commentsInput.value.trim() : "";

            // Validate task score
            if (isNaN(taskScore) || taskScore < 0 || taskScore > task.maxScore) {
                hasError = true;
                this.showToast(
                    `${student.name} এর জন্য টাস্ক স্কোর ০-${task.maxScore} এর মধ্যে হতে হবে`,
                    "error"
                );
                return;
            }

            // Validate teamwork score
            if (isNaN(teamworkScore) || teamworkScore < 0 || teamworkScore > 10) {
                hasError = true;
                this.showToast(
                    `${student.name} এর জন্য টিমওয়ার্ক স্কোর ০-১০ এর মধ্যে হতে হবে`,
                    "error"
                );
                return;
            }

            // Collect option marks
            const optionMarks = {};
            this.evaluationOptions.forEach((option) => {
                const checkbox = document.querySelector(
                    `[data-student="${student.id}"][data-option="${option.id}"]`
                );
                optionMarks[option.id] = {
                    optionId: option.id,
                    selected: checkbox ? checkbox.checked : false,
                };
            });

            newScores[student.id] = {
                taskScore,
                teamworkScore,
                comments,
                optionMarks,
            };
        });

        if (hasError) return;

        this.showLoading("সংরক্ষণ হচ্ছে...");
        try {
            const evaluationData = {
                taskId,
                groupId,
                scores: newScores,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };

            if (isEditing && id) {
                // Update existing evaluation
                await db.collection("evaluations").doc(id).update(evaluationData);
                this.showToast("মূল্যায়ন সফলভাবে আপডেট করা হয়েছে", "success");
            } else {
                // Create new evaluation
                evaluationData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("evaluations").add(evaluationData);
                this.showToast("মূল্যায়ন সফলভাবে সংরক্ষণ করা হয়েছে", "success");
            }

            // Clear cache and reload data
            this.cache.clear("evaluations_data");
            await this.loadEvaluations();
            this.cancelEvaluation();
        } catch (error) {
            this.showToast("মূল্যায়ন সংরক্ষণ ব্যর্থ: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }


  // ===============================
    // CSV IMPORT/EXPORT
    // ===============================
    importCSV() {
        this.dom.csvFileInput.click();
    }

    async handleCSVFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.dom.csvFileName.textContent = file.name;
        this.dom.processImportBtn.classList.remove('hidden');

        // Parse CSV file
        Papa.parse(file, {
            header: true,
            complete: (results) => {
                this.csvImportData = results.data;
                this.showToast(`${results.data.length}টি শিক্ষার্থীর ডেটা লোড হয়েছে`, 'success');
            },
            error: (error) => {
                this.showToast('CSV ফাইল পার্স করতে সমস্যা: ' + error.message, 'error');
            }
        });
    }

    async processCSVImport() {
        if (!this.csvImportData || this.csvImportData.length === 0) {
            this.showToast('প্রথমে CSV ফাইল নির্বাচন করুন', 'error');
            return;
        }

        this.showLoading('শিক্ষার্থী ইম্পোর্ট হচ্ছে...');
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const studentData of this.csvImportData) {
                try {
                    // Validate required fields
                    if (!studentData.নাম || !studentData.রোল || !studentData.গ্রুপ) {
                        errorCount++;
                        continue;
                    }

                    // Find group by name
                    const group = this.state.groups.find(g => g.name === studentData.গ্রুপ);
                    if (!group) {
                        errorCount++;
                        continue;
                    }

                    // Check for duplicates
                    const isDuplicate = await this.checkStudentUniqueness(studentData.রোল, studentData.একাডেমিক_গ্রুপ || '');
                    if (isDuplicate) {
                        errorCount++;
                        continue;
                    }

                    // Prepare student data
                    const student = {
                        name: studentData.নাম,
                        roll: studentData.রোল,
                        gender: studentData.লিঙ্গ || 'ছেলে',
                        groupId: group.id,
                        contact: studentData.যোগাযোগ || '',
                        academicGroup: studentData.একাডেমিক_গ্রুপ || '',
                        session: studentData.সেশন || '',
                        role: this.getRoleKey(studentData.দায়িত্ব || '')
                    };

                    await db.collection("students").add({
                        ...student,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });

                    successCount++;
                } catch (error) {
                    errorCount++;
                }
            }

            // Clear cache and reload data
            this.cache.clear('students_data');
            await this.loadStudents();

            // Reset form
            this.dom.csvFileInput.value = '';
            this.dom.csvFileName.textContent = 'কোন ফাইল নির্বাচন করা হয়নি';
            this.dom.processImportBtn.classList.add('hidden');
            this.csvImportData = null;

            this.showToast(`${successCount}টি শিক্ষার্থী সফলভাবে ইম্পোর্ট হয়েছে, ${errorCount}টি ব্যর্থ`, 'success');
        } catch (error) {
            this.showToast('ইম্পোর্ট প্রসেস করতে সমস্যা: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    getRoleKey(roleName) {
        const roleMap = {
            'টিম লিডার': 'team-leader',
            'টাইম কিপার': 'time-keeper',
            'রিপোর্টার': 'reporter',
            'রিসোর্স ম্যানেজার': 'resource-manager',
            'পিস মেকার': 'peace-maker'
        };
        return roleMap[roleName] || '';
    }

    downloadCSVTemplate() {
        const headers = ['নাম', 'রোল', 'লিঙ্গ', 'গ্রুপ', 'একাডেমিক_গ্রুপ', 'সেশন', 'দায়িত্ব', 'যোগাযোগ'];
        const sampleData = [
            ['আব্দুল্লাহ আল মামুন', '101', 'ছেলে', 'গ্রুপ এ', 'বিজ্ঞান', '২০২৩-২৪', 'টিম লিডার', 'example@email.com'],
            ['সাদিয়া ইসলাম', '102', 'মেয়ে', 'গ্রুপ এ', 'বিজ্ঞান', '২০২৩-২৪', 'রিপোর্টার', '']
        ];

        const csvContent = [headers, ...sampleData]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        this.downloadCSV(csvContent, 'student_template.csv');
        this.showToast('CSV টেমপ্লেট ডাউনলোড হয়েছে', 'success');
    }

    async exportStudentsCSV() {
        this.showLoading();
        try {
            const headers = ['নাম', 'রোল', 'লিঙ্গ', 'গ্রুপ', 'একাডেমিক_গ্রুপ', 'সেশন', 'দায়িত্ব', 'যোগাযোগ'];
            const data = this.state.students.map(student => {
                const group = this.state.groups.find(g => g.id === student.groupId);
                return [
                    student.name,
                    student.roll,
                    student.gender,
                    group?.name || '',
                    student.academicGroup || '',
                    student.session || '',
                    this.roleNames[student.role] || student.role || '',
                    student.contact || ''
                ];
            });

            const csvContent = [headers, ...data]
                .map(row => row.map(field => `"${field}"`).join(','))
                .join('\n');

            this.downloadCSV(csvContent, 'students.csv');
            this.showToast('শিক্ষার্থী CSV এক্সপোর্ট সফল', 'success');
        } catch (error) {
            this.showToast('CSV এক্সপোর্ট করতে সমস্যা', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async exportGroupsCSV() {
        this.showLoading();
        try {
            const headers = ['গ্রুপ নাম', 'সদস্য সংখ্যা', 'গড় স্কোর'];
            const memberCountMap = this.computeMemberCountMap();
            const groupScores = this.calculateGroupScores();
            
            const data = this.state.groups.map(group => [
                group.name,
                memberCountMap[group.id] || 0,
                groupScores[group.id]?.score.toFixed(2) || '0.00'
            ]);

            const csvContent = [headers, ...data]
                .map(row => row.map(field => `"${field}"`).join(','))
                .join('\n');

            this.downloadCSV(csvContent, 'groups.csv');
            this.showToast('গ্রুপ CSV এক্সপোর্ট সফল', 'success');
        } catch (error) {
            this.showToast('CSV এক্সপোর্ট করতে সমস্যা', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async exportEvaluationsCSV() {
        this.showLoading();
        try {
            const headers = ['টাস্ক', 'গ্রুপ', 'শিক্ষার্থী', 'টাস্ক স্কোর', 'টিমওয়ার্ক স্কোর', 'অতিরিক্ত পয়েন্ট', 'মোট স্কোর', 'মন্তব্য'];
            const data = [];

            this.state.evaluations.forEach(evalItem => {
                const task = this.state.tasks.find(t => t.id === evalItem.taskId);
                const group = this.state.groups.find(g => g.id === evalItem.groupId);
                
                if (evalItem.scores) {
                    Object.entries(evalItem.scores).forEach(([studentId, score]) => {
                        const student = this.state.students.find(s => s.id === studentId);
                        if (student) {
                            let additionalMarks = 0;
                            if (score.optionMarks) {
                                Object.values(score.optionMarks).forEach(opt => {
                                    if (opt.selected) {
                                        const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                        if (optDef) additionalMarks += optDef.marks;
                                    }
                                });
                            }
                            
                            const total = (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                            
                            data.push([
                                task?.name || 'Unknown',
                                group?.name || 'Unknown',
                                student.name,
                                score.taskScore || 0,
                                score.teamworkScore || 0,
                                additionalMarks,
                                total,
                                score.comments || ''
                            ]);
                        }
                    });
                }
            });

            const csvContent = [headers, ...data]
                .map(row => row.map(field => `"${field}"`).join(','))
                .join('\n');

            this.downloadCSV(csvContent, 'evaluations.csv');
            this.showToast('মূল্যায়ন CSV এক্সপোর্ট সফল', 'success');
        } catch (error) {
            this.showToast('CSV এক্সপোর্ট করতে সমস্যা', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async exportAllData() {
        this.showLoading('ডেটা এক্সপোর্ট হচ্ছে...');
        
        try {
            // Create ZIP file with all CSV files
            const zip = new JSZip();
            
            // Add students CSV
            const studentsCSV = await this.generateStudentsCSV();
            zip.file("students.csv", studentsCSV);
            
            // Add groups CSV with average scores
            const groupsCSV = await this.generateGroupsCSV();
            zip.file("groups.csv", groupsCSV);
            
            // Add evaluations CSV
            const evaluationsCSV = await this.generateEvaluationsCSV();
            zip.file("evaluations.csv", evaluationsCSV);
            
            // Add tasks CSV
            const tasksCSV = await this.generateTasksCSV();
            zip.file("tasks.csv", tasksCSV);
            
            // Add group performance report
            const performanceCSV = await this.generatePerformanceReport();
            zip.file("performance_report.csv", performanceCSV);
            
            // Generate and download ZIP
            const content = await zip.generateAsync({type: "blob"});
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `smart_evaluator_data_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast('সমস্ত ডেটা ZIP এক্সপোর্ট সফল', 'success');
        } catch (error) {
            this.showToast('ZIP এক্সপোর্ট করতে সমস্যা: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Helper methods for CSV generation
    async generateStudentsCSV() {
        const headers = ['নাম', 'রোল', 'লিঙ্গ', 'গ্রুপ', 'একাডেমিক_গ্রুপ', 'সেশন', 'দায়িত্ব', 'যোগাযোগ'];
        const data = this.state.students.map(student => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            return [
                student.name,
                student.roll,
                student.gender,
                group?.name || '',
                student.academicGroup || '',
                student.session || '',
                this.roleNames[student.role] || student.role || '',
                student.contact || ''
            ];
        });

        return [headers, ...data]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    async generateGroupsCSV() {
        const headers = ['গ্রুপ নাম', 'সদস্য সংখ্যা', 'গড় স্কোর'];
        const memberCountMap = this.computeMemberCountMap();
        const groupScores = this.calculateGroupScores();
        
        const data = this.state.groups.map(group => [
            group.name,
            memberCountMap[group.id] || 0,
            groupScores[group.id]?.score.toFixed(2) || '0.00'
        ]);

        return [headers, ...data]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    async generateEvaluationsCSV() {
        const headers = ['টাস্ক', 'গ্রুপ', 'শিক্ষার্থী', 'টাস্ক স্কোর', 'টিমওয়ার্ক স্কোর', 'অতিরিক্ত পয়েন্ট', 'মোট স্কোর', 'মন্তব্য'];
        const data = [];

        this.state.evaluations.forEach(evalItem => {
            const task = this.state.tasks.find(t => t.id === evalItem.taskId);
            const group = this.state.groups.find(g => g.id === evalItem.groupId);
            
            if (evalItem.scores) {
                Object.entries(evalItem.scores).forEach(([studentId, score]) => {
                    const student = this.state.students.find(s => s.id === studentId);
                    if (student) {
                        let additionalMarks = 0;
                        if (score.optionMarks) {
                            Object.values(score.optionMarks).forEach(opt => {
                                if (opt.selected) {
                                    const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                    if (optDef) additionalMarks += optDef.marks;
                                }
                            });
                        }
                        
                        const total = (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                        
                        data.push([
                            task?.name || 'Unknown',
                            group?.name || 'Unknown',
                            student.name,
                            score.taskScore || 0,
                            score.teamworkScore || 0,
                            additionalMarks,
                            total,
                            score.comments || ''
                        ]);
                    }
                });
            }
        });

        return [headers, ...data]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    async generateTasksCSV() {
        const headers = ['টাস্ক নাম', 'বিবরণ', 'সর্বোচ্চ স্কোর', 'তারিখ'];
        const data = this.state.tasks.map(task => {
            const dateStr = task.date?.seconds ? 
                new Date(task.date.seconds * 1000).toLocaleDateString("bn-BD") : 
                'তারিখ নেই';
            return [
                task.name,
                task.description || '',
                task.maxScore,
                dateStr
            ];
        });

        return [headers, ...data]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    async generatePerformanceReport() {
        const headers = ['গ্রুপ', 'টাস্ক', 'গড় স্কোর', 'সর্বোচ্চ স্কোর', 'ন্যূনতম স্কোর', 'মোট মূল্যায়ন'];
        const data = [];

        this.state.groups.forEach(group => {
            const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
            
            this.state.tasks.forEach(task => {
                const taskEvaluations = groupEvaluations.filter(e => e.taskId === task.id);
                
                if (taskEvaluations.length > 0) {
                    let totalScore = 0;
                    let maxScore = 0;
                    let minScore = Infinity;
                    let evaluationCount = 0;

                    taskEvaluations.forEach(evalItem => {
                        if (evalItem.scores) {
                            Object.values(evalItem.scores).forEach(score => {
                                let additionalMarks = 0;
                                if (score.optionMarks) {
                                    Object.values(score.optionMarks).forEach(opt => {
                                        if (opt.selected) {
                                            const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                            if (optDef) additionalMarks += optDef.marks;
                                        }
                                    });
                                }
                                
                                const studentTotal = (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                                totalScore += studentTotal;
                                maxScore = Math.max(maxScore, studentTotal);
                                minScore = Math.min(minScore, studentTotal);
                                evaluationCount++;
                            });
                        }
                    });

                    const avgScore = evaluationCount > 0 ? (totalScore / evaluationCount).toFixed(2) : 0;
                    
                    data.push([
                        group.name,
                        task.name,
                        avgScore,
                        maxScore,
                        minScore === Infinity ? 0 : minScore,
                        evaluationCount
                    ]);
                }
            });
        });

        return [headers, ...data]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }


  

    // ===============================
    // GROUP MEMBERS MANAGEMENT
    // ===============================
    renderGroupMembers() {
        if (!this.dom.groupMembersGroupSelect || !this.dom.groupMembersList) return;

        // Populate group select
        this.dom.groupMembersGroupSelect.innerHTML = `
            <option value="">সকল গ্রুপ</option>
            ${this.state.groups
                .map(
                    (g) =>
                        `<option value="${g.id}" ${
                            this.filters.groupMembersFilterGroupId === g.id
                                ? "selected"
                                : ""
                        }>${g.name}</option>`
                )
                .join("")}
        `;

        const filteredStudents = this.getFilteredGroupMembers();
        this.renderGroupMembersList(filteredStudents);
    }

    getFilteredGroupMembers() {
        let students = this.state.students;

        if (this.filters.groupMembersFilterGroupId) {
            students = students.filter(
                (s) => s.groupId === this.filters.groupMembersFilterGroupId
            );
        }

        return students;
    }

    renderGroupMembersList(students) {
        if (!this.dom.groupMembersList) return;

        // Group students by group
        const studentsByGroup = {};
        students.forEach((student) => {
            const groupId = student.groupId;
            if (!studentsByGroup[groupId]) {
                studentsByGroup[groupId] = [];
            }
            studentsByGroup[groupId].push(student);
        });

        let content = "";

        if (Object.keys(studentsByGroup).length === 0) {
            content = '<p class="text-center text-gray-500 py-8">কোন শিক্ষার্থী পাওয়া যায়নি</p>';
        } else {
            Object.entries(studentsByGroup).forEach(([groupId, groupStudents]) => {
                const group = this.state.groups.find((g) => g.id === groupId);
                content += `
                    <div class="mb-6">
                        <h4 class="font-semibold text-lg mb-4 text-gray-800 dark:text-white">${
                            group?.name || "Unknown Group"
                        } - সদস্য তালিকা</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${groupStudents
                                .map((student) => {
                                    const roleBadge = student.role
                                        ? `<span class="member-role-badge ${student.role}">${
                                            this.roleNames[student.role]
                                        }</span>`
                                        : `<span class="px-2 py-1 text-xs rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">দায়িত্ব বাকি</span>`;

                                    return `
                                        <div class="member-card bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                            <div class="flex items-start justify-between mb-3">
                                                <div>
                                                    <h5 class="font-semibold text-gray-800 dark:text-white">${student.name}</h5>
                                                    <p class="text-sm text-gray-500 dark:text-gray-400">রোল: ${student.roll}</p>
                                                </div>
                                                ${roleBadge}
                                            </div>
                                            <div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                                <p><i class="fas fa-venus-mars mr-2"></i> ${student.gender}</p>
                                                <p><i class="fas fa-book mr-2"></i> ${student.academicGroup}</p>
                                                <p><i class="fas fa-calendar mr-2"></i> ${student.session}</p>
                                                ${
                                                    student.contact
                                                        ? `<p><i class="fas fa-envelope mr-2"></i> ${student.contact}</p>`
                                                        : ""
                                                }
                                            </div>
                                            ${
                                                this.currentUser
                                                    ? `
                                                <div class="mt-3 flex gap-2">
                                                    <button onclick="smartEvaluator.editStudent('${student.id}')" 
                                                            class="edit-member-btn flex-1 px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                                                        সম্পাদনা
                                                    </button>
                                                    <button onclick="smartEvaluator.deleteStudent('${student.id}')" 
                                                            class="delete-member-btn flex-1 px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                                                        ডিলিট
                                                    </button>
                                                </div>
                                            `
                                                    : ""
                                            }
                                        </div>
                                    `;
                                })
                                .join("")}
                        </div>
                    </div>
                `;
            });
        }

        this.dom.groupMembersList.innerHTML = content;
    }

    // ===============================
    // POLICY SECTIONS TOGGLE
    // ===============================
    togglePolicySection(index) {
        const content = document.getElementById(`policyContent-${index}`);
        const icon = document.getElementById(`policyIcon-${index}`);

        if (content && icon) {
            const isHidden = content.classList.contains("hidden");
            content.classList.toggle("hidden", !isHidden);
            icon.classList.toggle("fa-chevron-down", isHidden);
            icon.classList.toggle("fa-chevron-up", !isHidden);
            icon.classList.toggle("rotate-180", !isHidden);
        }
    }

    // ===============================
    // GROUP DETAILS MODAL
    // ===============================
    showGroupDetailsModal(groupId) {
        const group = this.state.groups.find((g) => g.id === groupId);
        if (!group) return;

        this.dom.groupDetailsTitle.textContent = `${group.name} - বিস্তারিত ফলাফলের তথ্য:`;
        this.renderGroupDetails(groupId);
        this.showModal(this.dom.groupDetailsModal);
    }

    hideGroupDetailsModal() {
        this.hideModal(this.dom.groupDetailsModal);
    }

    // ===============================
    // POPULATE SELECTS
    // ===============================
    populateSelects() {
        // Populate group selects
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

        // Populate task selects
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

        // Populate role select
        const roleSelect = document.getElementById("studentRoleInput");
        if (roleSelect) {
            roleSelect.innerHTML = `
                <option value="">কোনোটি না</option>
                ${Object.entries(this.roleNames)
                    .map(([key, value]) => `<option value="${key}">${value}</option>`)
                    .join("")}
            `;
        }
    }

    // ===============================
    // REFRESH RANKING
    // ===============================
    refreshRanking() {
        this.cache.clear("evaluations_data");
        this.loadEvaluations().then(() => {
            this.renderStudentRanking();
            this.showToast("র‌্যাঙ্কিং রিফ্রেশ করা হয়েছে", "success");
        });
    }

    // ===============================
    // AUTH FORM TOGGLE
    // ===============================
    toggleAuthForms(showRegister = false) {
        const loginForm = document.getElementById("loginForm");
        const registerForm = document.getElementById("registerForm");
        const showRegisterBtn = document.getElementById("showRegister");
        const showLoginBtn = document.getElementById("showLogin");

        if (showRegister) {
            loginForm.classList.add("hidden");
            registerForm.classList.remove("hidden");
            showRegisterBtn.classList.add("hidden");
            showLoginBtn.classList.remove("hidden");
        } else {
            loginForm.classList.remove("hidden");
            registerForm.classList.add("hidden");
            showRegisterBtn.classList.remove("hidden");
            showLoginBtn.classList.add("hidden");
        }
    }

}

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    window.smartEvaluator = new SmartGroupEvaluator();
});