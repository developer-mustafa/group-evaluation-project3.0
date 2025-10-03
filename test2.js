// app.js - COMPLETE VERSION WITH ALL FEATURES RESTORED
class CacheManager {
    constructor() {
        this.CACHE_DURATION = 5 * 60 * 1000;
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

        this.groupColors = [
            "bg-gradient-to-r from-blue-500 to-blue-600",
            "bg-gradient-to-r from-green-500 to-green-600", 
            "bg-gradient-to-r from-purple-500 to-purple-600",
            "bg-gradient-to-r from-red-500 to-red-600",
            "bg-gradient-to-r from-yellow-500 to-yellow-600",
            "bg-gradient-to-r from-indigo-500 to-indigo-600",
            "bg-gradient-to-r from-pink-500 to-pink-600",
            "bg-gradient-to-r from-teal-500 to-teal-600"
        ];

        this.init();
    }

    async init() {
        this.setupDOMReferences();
        await this.initializeFirebase();
        this.setupEventListeners();
        this.setupAuthStateListener();
        this.applySavedTheme();

        this.updateUserInterface(null);
        this.enableAllNavigation(false);
        
        await this.loadPublicData();

        this.isInitialized = true;
        console.log("Smart Evaluator initialized successfully");
    }

    setupAuthStateListener() {
        auth.onAuthStateChanged(async (user) => {
            console.log("Auth State Changed:", user ? "Logged in" : "Logged out");
            
            if (user) {
                try {
                    this.currentUser = user;
                    this.currentUserData = await this.getUserAdminData(user);
                    await this.handleSuccessfulLogin(user);
                } catch (error) {
                    console.error("Error in auth state change:", error);
                    await this.handleLogout();
                }
            } else {
                await this.handleLogout();
            }
        });
    }

    async initializeFirebase() {
        try {
            await db.collection("groups").limit(1).get();
            console.log("Firebase connected successfully");
        } catch (error) {
            console.error("Firebase connection failed:", error);
            this.showToast("ডেটাবেস সংযোগ ব্যর্থ", "error");
        }
    }

    setupDOMReferences() {
        this.dom = {
            // Core elements
            loginHeaderBtn: document.getElementById("headerLoginBtn"),
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
            
            // Navigation
            navBtns: document.querySelectorAll(".nav-btn"),
            pages: document.querySelectorAll(".page"),

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

            // UI Elements
            loadingOverlay: document.getElementById("loadingOverlay"),
            toast: document.getElementById("toast"),
            toastMessage: document.getElementById("toastMessage"),

            // Forms and Lists
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
            
            // Filter and Search
            membersFilterGroup: document.getElementById("membersFilterGroup"),
            studentSearchInput: document.getElementById("studentSearchInput"),
            cardsFilterGroup: document.getElementById("cardsFilterGroup"),
            allStudentsSearchInput: document.getElementById("allStudentsSearchInput"),

            // Other pages
            refreshRanking: document.getElementById("refreshRanking"),
            studentRankingList: document.getElementById("studentRankingList"),
            groupAnalysisChart: document.getElementById("groupAnalysisChart"),
            policySections: document.getElementById("policySections"),
            exportAllData: document.getElementById("exportAllData"),
            groupMembersGroupSelect: document.getElementById("groupMembersGroupSelect"),
            groupMembersList: document.getElementById("groupMembersList"),
        };
    }

    setupEventListeners() {
        // Auth events
        this.addListener(this.dom.loginHeaderBtn, "click", () => this.showAuthModal());
        this.addListener(this.dom.showRegister, "click", () => this.toggleAuthForms());
        this.addListener(this.dom.showLogin, "click", () => this.toggleAuthForms(false));
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

        // Theme and navigation
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
        this.addListener(this.dom.refreshRanking, "click", () => this.refreshRanking());

        // Setup search and filters
        this.setupSearchAndFilterEvents();
    }

    addListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    setupSearchAndFilterEvents() {
        // Search functionality
        const searchInputs = [
            { id: "studentSearchInput", callback: (value) => this.handleStudentSearch(value) },
            { id: "allStudentsSearchInput", callback: (value) => this.handleAllStudentsSearch(value) },
        ];

        searchInputs.forEach(({ id, callback }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener("input", (e) => {
                    setTimeout(() => callback(e.target.value), 300);
                });
            }
        });

        // Filter events
        const groupFilters = [
            { id: "membersFilterGroup", callback: (value) => this.handleMembersFilter(value) },
            { id: "cardsFilterGroup", callback: (value) => this.handleCardsFilter(value) },
            { id: "groupMembersGroupSelect", callback: (value) => this.handleGroupMembersFilter(value) },
        ];

        groupFilters.forEach(({ id, callback }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener("change", (e) => callback(e.target.value));
            }
        });
    }

    // ===============================
    // AUTHENTICATION METHODS
    // ===============================
    async handleSuccessfulLogin(user) {
        try {
            this.isPublicMode = false;
            this.currentUser = user;

            this.updateUserInterface(this.currentUserData);
            this.hideAuthModal();
            
            if (this.dom.appContainer) {
                this.dom.appContainer.classList.remove("hidden");
            }

            await this.loadInitialData();
            this.enableAllNavigation(true);
            this.showPage("dashboard");

            this.showToast(`লগইন সফল! ${user.email}`, "success");
            
        } catch (error) {
            console.error("Login handling error:", error);
            this.showToast("লগইন সম্পন্ন কিন্তু ডেটা লোড করতে সমস্যা", "warning");
        }
    }

    async handleLogout() {
        try {
            await auth.signOut();
            
            this.isPublicMode = true;
            this.currentUser = null;
            this.currentUserData = null;
    
            this.updateUserInterface(null);
            this.cache.clearAll();

            this.hideAuthModal();
            this.hideLogoutModal();
            
            if (this.dom.appContainer) {
                this.dom.appContainer.classList.remove("hidden");
            }
    
            await this.loadPublicData();
            this.enableAllNavigation(false);
            this.ensurePublicPage();
    
            this.showToast("লগআউট সম্পন্ন", "info");
        } catch (error) {
            console.error("Logout error:", error);
            this.showToast("লগআউট করতে সমস্যা", "error");
        }
    }

    showAuthModal() {
        this.toggleAuthForms(false);
        this.dom.authModal.classList.remove("hidden");
        this.dom.appContainer.classList.add("hidden");
    }

    hideAuthModal() {
        this.dom.authModal.classList.add("hidden");
    }

    async handleLogin() {
        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;

        if (!email || !password) {
            this.showToast("ইমেইল এবং পাসওয়ার্ড প্রয়োজন", "error");
            return;
        }

        if (!this.validateEmail(email)) {
            this.showToast("সঠিক ইমেইল ঠিকানা লিখুন", "error");
            return;
        }

        this.showLoading();
        try {
            await auth.signInWithEmailAndPassword(email, password);
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
            default:
                errorMessage = `${type === "login" ? "লগইন" : "রেজিস্ট্রেশন"} ব্যর্থ: ${error.message}`;
        }

        this.showToast(errorMessage, "error");
    }

    async getUserAdminData(user) {
        const cacheKey = `admin_${user.uid}`;
        
        try {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;

            const adminDoc = await db.collection("admins").doc(user.uid).get();
            
            if (adminDoc.exists) {
                const data = adminDoc.data();
                this.cache.set(cacheKey, data);
                return data;
            } else {
                const basicData = {
                    email: user.email,
                    type: "user",
                    permissions: { read: true, write: false, delete: false }
                };
                this.cache.set(cacheKey, basicData);
                return basicData;
            }
        } catch (error) {
            console.error("Error fetching admin data:", error);
            const basicData = {
                email: user.email,
                type: "user",
                permissions: { read: true, write: false, delete: false }
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
        
        // Check authentication for private pages
        if (!this.currentUser && this.PRIVATE_PAGES.includes(pageId)) {
            this.showToast("এই পেজ দেখতে লগইন প্রয়োজন", "error");
            this.showAuthModal();
            return;
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
            }
        } catch (error) {
            console.error(`Error loading page ${pageId}:`, error);
        }
    }

    enableAllNavigation(isLoggedIn) {
        console.log("Enabling navigation for:", isLoggedIn ? "Logged in" : "Logged out");
        
        this.dom.navBtns.forEach((btn) => {
            const pageId = btn.getAttribute("data-page");
            
            if (isLoggedIn && this.currentUserData) {
                // User is logged in
                const userRole = this.currentUserData.type;
                
                if (userRole === "super-admin") {
                    // Super Admin - সকল page access
                    btn.classList.remove("private-tab");
                    btn.disabled = false;
                } else if (userRole === "admin") {
                    // Admin - admin-management বাদে সকল page
                    if (pageId === "admin-management") {
                        btn.classList.add("private-tab");
                        btn.disabled = true;
                    } else {
                        btn.classList.remove("private-tab");
                        btn.disabled = false;
                    }
                } else {
                    // Regular user - শুধু public pages
                    if (this.PUBLIC_PAGES.includes(pageId)) {
                        btn.classList.remove("private-tab");
                        btn.disabled = false;
                    } else {
                        btn.classList.add("private-tab");
                        btn.disabled = true;
                    }
                }
            } else {
                // Not logged in - শুধু public pages
                if (this.PUBLIC_PAGES.includes(pageId)) {
                    btn.classList.remove("private-tab");
                    btn.disabled = false;
                } else {
                    btn.classList.add("private-tab");
                    btn.disabled = true;
                }
            }
        });
    }

    updateUserInterface(userData) {
        if (!this.dom.userInfo || !this.dom.logoutBtn || !this.dom.loginHeaderBtn) return;

        if (userData && this.currentUser) {
            const roleText = userData.type === "super-admin" ? "সুপার অ্যাডমিন" : 
                            userData.type === "admin" ? "অ্যাডমিন" : "সাধারণ ব্যবহারকারী";
            
            const roleColor = userData.type === "super-admin" ? "text-purple-600" : 
                             userData.type === "admin" ? "text-blue-600" : "text-green-600";

            this.dom.userInfo.innerHTML = `
                <div class="font-medium">${userData.email}</div>
                <div class="text-xs ${roleColor}">${roleText}</div>
            `;

            this.dom.logoutBtn.classList.remove("hidden");
            this.dom.loginHeaderBtn.classList.add("hidden");

        } else {
            this.dom.userInfo.innerHTML = `<div class="text-xs text-gray-500">সাধারণ ব্যবহারকারী</div>`;
            this.dom.logoutBtn.classList.add("hidden");
            this.dom.loginHeaderBtn.classList.remove("hidden");
        }
    }

    showPage(pageId) {
        // Hide all pages
        this.dom.pages.forEach((page) => {
            page.classList.add("hidden");
        });

        // Show selected page
        const selectedPage = document.getElementById(`page-${pageId}`);
        if (selectedPage) {
            selectedPage.classList.remove("hidden");
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
            await Promise.all([
                this.loadGroups(),
                this.loadStudents(),
                this.loadTasks(),
                this.loadEvaluations(),
            ]);

            this.populateSelects();
            this.renderPolicySections();
        } catch (error) {
            console.error("Public data load error:", error);
        } finally {
            this.hideLoading();
        }
    }

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
        }
    }

    populateSelects() {
        // Populate group selects
        const groupSelects = [
            "studentGroupInput",
            "membersFilterGroup",
            "cardsFilterGroup",
            "groupMembersGroupSelect",
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

        // Populate task select
        const taskSelect = document.getElementById("evaluationTaskSelect");
        if (taskSelect) {
            taskSelect.innerHTML = `
                <option value="">টাস্ক নির্বাচন করুন</option>
                ${this.state.tasks
                    .map((t) => `<option value="${t.id}">${t.name}</option>`)
                    .join("")}
            `;
        }

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
    // RENDERING METHODS - FIXED WITH GROUP COLORS
    // ===============================
    renderGroups() {
        if (!this.dom.groupsList) return;

        const memberCountMap = this.computeMemberCountMap();
        const evaluationCountMap = this.computeEvaluationCountMap();

        this.dom.groupsList.innerHTML = this.state.groups
            .map((group, index) => {
                const colorClass = this.groupColors[index % this.groupColors.length];
                const memberCount = memberCountMap[group.id] || 0;
                const evalCount = evaluationCountMap[group.id] || 0;

                return `
                <div class="group-card ${colorClass} text-white rounded-xl p-4 shadow-md relative overflow-hidden">
                    <span class="serial-number">${index + 1}</span>
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-bold text-lg">${group.name}</h3>
                        <div class="text-right">
                            <div class="text-2xl font-bold">${memberCount}</div>
                            <div class="text-sm opacity-80">সদস্য</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div class="bg-white bg-opacity-20 rounded p-2 text-center">
                            <div class="font-semibold">${evalCount}</div>
                            <div class="text-xs opacity-80">মূল্যায়ন</div>
                        </div>
                        <div class="bg-white bg-opacity-20 rounded p-2 text-center">
                            <div class="font-semibold">${this.calculateGroupAverageScore(group.id).toFixed(1)}</div>
                            <div class="text-xs opacity-80">গড় স্কোর</div>
                        </div>
                    </div>
                    ${this.currentUser ? `
                    <div class="flex gap-2 mt-3">
                        <button onclick="smartEvaluator.editGroup('${group.id}')" 
                                class="flex-1 bg-white bg-opacity-20 hover:bg-opacity-30 text-white py-1 px-2 rounded text-sm transition-all">
                            সম্পাদনা
                        </button>
                        <button onclick="smartEvaluator.deleteGroup('${group.id}')" 
                                class="flex-1 bg-white bg-opacity-20 hover:bg-opacity-30 text-white py-1 px-2 rounded text-sm transition-all">
                            ডিলিট
                        </button>
                    </div>
                    ` : ''}
                </div>
            `;
            })
            .join("");
    }

    renderStudentsList() {
        if (!this.dom.studentsList) return;

        const filteredStudents = this.getFilteredStudents();

        this.dom.studentsList.innerHTML = filteredStudents
            .map((student) => {
                const group = this.state.groups.find((g) => g.id === student.groupId);
                const roleBadge = student.role
                    ? `<span class="px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">${
                        this.roleNames[student.role] || student.role
                    }</span>`
                    : "";

                return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-2">
                                    <h4 class="font-semibold text-gray-800 dark:text-white">${student.name}</h4>
                                    ${roleBadge}
                                </div>
                                <div class="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <div><i class="fas fa-id-card mr-2"></i>রোল: ${student.roll}</div>
                                    <div><i class="fas fa-venus-mars mr-2"></i>লিঙ্গ: ${student.gender}</div>
                                    <div><i class="fas fa-users mr-2"></i>গ্রুপ: ${group?.name || "না"}</div>
                                    <div><i class="fas fa-book mr-2"></i>একাডেমিক: ${student.academicGroup || "না"}</div>
                                </div>
                            </div>
                            ${this.currentUser ? `
                            <div class="flex gap-2 ml-4">
                                <button onclick="smartEvaluator.editStudent('${student.id}')" 
                                        class="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                                    সম্পাদনা
                                </button>
                                <button onclick="smartEvaluator.deleteStudent('${student.id}')" 
                                        class="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                                    ডিলিট
                                </button>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    renderStudentCards() {
        if (!this.dom.allStudentsCards) return;

        const filteredStudents = this.getFilteredStudents("cards");
        const groupColorMap = this.createGroupColorMap();

        this.dom.allStudentsCards.innerHTML = filteredStudents
            .map((student, index) => {
                const group = this.state.groups.find((g) => g.id === student.groupId);
                const groupIndex = this.state.groups.findIndex(g => g.id === student.groupId);
                const colorClass = groupColorMap[student.groupId] || this.groupColors[0];

                const roleBadge = student.role
                    ? `<span class="px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">${
                        this.roleNames[student.role] || student.role
                    }</span>`
                    : `<span class="px-2 py-1 text-xs rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">দায়িত্ব বাকি</span>`;

                return `
                    <div class="student-card ${colorClass} text-white rounded-xl p-4 shadow-md relative overflow-hidden">
                        <span class="serial-number">${index + 1}</span>
                        <div class="flex items-start mb-3">
                            <div class="student-avatar bg-white bg-opacity-20 w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg">
                                ${student.name.charAt(0)}
                            </div>
                            <div class="flex-1 ml-3">
                                <h3 class="font-bold text-lg">${student.name}</h3>
                                <div class="mt-1">${roleBadge}</div>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 gap-2 text-sm">
                            <p><i class="fas fa-id-card mr-2"></i> রোল: ${student.roll}</p>
                            <p><i class="fas fa-venus-mars mr-2"></i> লিঙ্গ: ${student.gender}</p>
                            <p><i class="fas fa-users mr-2"></i> গ্রুপ: ${group?.name || "না"}</p>
                            <p><i class="fas fa-book mr-2"></i> একাডেমিক: ${student.academicGroup || "না"}</p>
                            <p><i class="fas fa-calendar mr-2"></i> সেশন: ${student.session || "না"}</p>
                            ${student.contact ? `<p><i class="fas fa-envelope mr-2"></i> ${student.contact}</p>` : ""}
                        </div>
                        ${this.currentUser ? `
                        <div class="flex gap-2 mt-3">
                            <button onclick="smartEvaluator.editStudent('${student.id}')" 
                                    class="flex-1 bg-white bg-opacity-20 hover:bg-opacity-30 text-white py-1 px-2 rounded text-sm transition-all">
                                সম্পাদনা
                            </button>
                            <button onclick="smartEvaluator.deleteStudent('${student.id}')" 
                                    class="flex-1 bg-white bg-opacity-20 hover:bg-opacity-30 text-white py-1 px-2 rounded text-sm transition-all">
                                ডিলিট
                            </button>
                        </div>
                        ` : ''}
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
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1">
                                <h3 class="font-semibold text-gray-800 dark:text-white mb-2">${task.name}</h3>
                                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${task.description || "কোন বিবরণ নেই"}</p>
                                <div class="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                                    <span><i class="fas fa-calendar mr-1"></i> ${dateStr}</span>
                                    <span><i class="fas fa-star mr-1"></i> সর্বোচ্চ স্কোর: ${task.maxScore}</span>
                                </div>
                            </div>
                            ${this.currentUser ? `
                            <div class="flex gap-2 ml-4">
                                <button onclick="smartEvaluator.editTask('${task.id}')" 
                                        class="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                                    সম্পাদনা
                                </button>
                                <button onclick="smartEvaluator.deleteTask('${task.id}')" 
                                        class="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                                    ডিলিট
                                </button>
                            </div>
                            ` : ''}
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
                const group = this.state.groups.find((g) => g.id === evaluation.groupId);
                const totalScore = this.calculateEvaluationTotalScore(evaluation);
                const dateStr = evaluation.updatedAt?.seconds
                    ? new Date(evaluation.updatedAt.seconds * 1000).toLocaleDateString("bn-BD")
                    : "তারিখ নেই";

                return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${task?.name || "Unknown Task"}</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${group?.name || "Unknown Group"}</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-3 text-gray-700 dark:text-gray-300">${dateStr}</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-3 font-semibold text-blue-600 dark:text-blue-400">${totalScore}</td>
                        <td class="border border-gray-300 dark:border-gray-600 p-3">
                            <div class="flex gap-2">
                                <button onclick="smartEvaluator.editEvaluation('${evaluation.id}')" 
                                        class="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                                    সম্পাদনা
                                </button>
                                ${this.currentUser?.type === "super-admin" ? `
                                <button onclick="smartEvaluator.deleteEvaluation('${evaluation.id}')" 
                                        class="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                                    ডিলিট
                                </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    renderPolicySections() {
        if (!this.dom.policySections) return;

        this.dom.policySections.innerHTML = `
            <div class="space-y-4">
                <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 class="font-semibold text-lg mb-4 text-gray-800 dark:text-white">গ্রুপ সদস্য নিয়মাবলী</h3>
                    <div class="text-gray-600 dark:text-gray-300 space-y-2">
                        <p>১. প্রতিটি গ্রুপে সর্বোচ্চ ৫ জন সদস্য থাকবে।</p>
                        <p>২. প্রত্যেক সদস্যের একটি নির্দিষ্ট দায়িত্ব থাকবে।</p>
                        <p>৩. গ্রুপ লিডার দায়িত্ব পালন নিশ্চিত করবে।</p>
                        <p>৪. সকল সদস্যকে সাপ্তাহিক মিটিং এ উপস্থিত থাকতে হবে।</p>
                        <p>৫. গ্রুপ কাজ সময়মতো জমা দিতে হবে।</p>
                    </div>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 class="font-semibold text-lg mb-4 text-gray-800 dark:text-white">মূল্যায়ন পদ্ধতি</h3>
                    <div class="text-gray-600 dark:text-gray-300 space-y-2">
                        <p>১. টাস্ক সম্পূর্ণতা - ৪০%</p>
                        <p>২. টিমওয়ার্ক - ৩০%</p>
                        <p>৩. সময়ানুবর্তিতা - ২০%</p>
                        <p>৪. অতিরিক্ত কাজ - ১০%</p>
                        <p>৫. উপস্থিতি - বোনাস পয়েন্ট</p>
                        <p>৬. বাড়ির কাজ - বোনাস পয়েন্ট</p>
                    </div>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 class="font-semibold text-lg mb-4 text-gray-800 dark:text-white">স্কোরিং সিস্টেম</h3>
                    <div class="text-gray-600 dark:text-gray-300 space-y-2">
                        <p>টাস্ক স্কোর: ০-১০০ পয়েন্ট</p>
                        <p>টিমওয়ার্ক: ০-১০ পয়েন্ট</p>
                        <p>অতিরিক্ত পয়েন্ট: বিশেষ কৃতিত্বের জন্য</p>
                        <p>নেগেটিভ পয়েন্ট: দায়িত্ব পালনে ব্যর্থতা</p>
                        <p>বোনাস পয়েন্ট: অতিরিক্ত কাজের জন্য</p>
                    </div>
                </div>
            </div>
        `;
    }

    // ===============================
    // CALCULATION METHODS
    // ===============================
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

    computeEvaluationCountMap() {
        const map = {};
        this.state.groups.forEach((g) => {
            map[g.id] = 0;
        });
        this.state.evaluations.forEach((e) => {
            if (e.groupId) map[e.groupId] = (map[e.groupId] || 0) + 1;
        });
        return map;
    }

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
    getFilteredStudents(type = "members") {
        let students = this.state.students;

        if (type === "members") {
            if (this.filters.membersFilterGroupId) {
                students = students.filter(
                    (s) => s.groupId === this.filters.membersFilterGroupId
                );
            }

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
            if (this.filters.cardsFilterGroupId) {
                students = students.filter(
                    (s) => s.groupId === this.filters.cardsFilterGroupId
                );
            }

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

    createGroupColorMap() {
        const map = {};
        this.state.groups.forEach((group, index) => {
            map[group.id] = this.groupColors[index % this.groupColors.length];
        });
        return map;
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
            const isDuplicate = await this.checkStudentUniqueness(
                studentData.roll,
                studentData.academicGroup
            );
            if (isDuplicate) {
                this.showToast("এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী ইতিমধ্যে আছে", "error");
                this.hideLoading();
                return;
            }

            await db.collection("students").add({
                ...studentData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            this.clearStudentForm();
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
    // EDIT OPERATIONS
    // ===============================
    async editStudent(id) {
        const student = this.state.students.find((s) => s.id === id);
        if (!student) return;

        this.dom.editModalTitle.textContent = "শিক্ষার্থী সম্পাদনা";
        this.dom.editModalContent.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">নাম</label>
                    <input id="editName" type="text" value="${student.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">রোল</label>
                    <input id="editRoll" type="text" value="${student.roll}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">লিঙ্গ</label>
                    <select id="editGender" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                        <option value="ছেলে" ${student.gender === "ছেলে" ? "selected" : ""}>ছেলে</option>
                        <option value="মেয়ে" ${student.gender === "মেয়ে" ? "selected" : ""}>মেয়ে</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">গ্রুপ</label>
                    <select id="editGroup" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
                        ${this.state.groups.map((g) => `<option value="${g.id}" ${student.groupId === g.id ? "selected" : ""}>${g.name}</option>`).join("")}
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
            };

            if (!newData.name || !newData.roll || !newData.gender || !newData.groupId) {
                this.showToast("সমস্ত প্রয়োজনীয় তথ্য পূরণ করুন", "error");
                return;
            }

            this.showLoading();
            try {
                await db.collection("students").doc(id).update(newData);
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
                <input id="editGroupName" type="text" value="${group.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white">
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

    async editEvaluation(id) {
        const evaluation = this.state.evaluations.find((e) => e.id === id);
        if (!evaluation) return;

        this.showToast("মূল্যায়ন সম্পাদনা করতে মূল্যায়ন পৃষ্ঠায় যান", "info");
        this.showPage("evaluation");
    }

    // ===============================
    // DELETE OPERATIONS
    // ===============================
    async deleteStudent(id) {
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

    async deleteTask(id) {
        this.showDeleteModal("এই টাস্ক ডিলিট করবেন?", async () => {
            this.showLoading();
            try {
                await db.collection("tasks").doc(id).delete();
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

    // ===============================
    // UTILITY METHODS
    // ===============================
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async checkStudentUniqueness(roll, academicGroup, excludeId = null) {
        const query = db
            .collection("students")
            .where("roll", "==", roll)
            .where("academicGroup", "==", academicGroup);
        const snap = await query.get();
        return !snap.empty && snap.docs.some((doc) => doc.id !== excludeId);
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

        toastMessage.textContent = message;
        toast.className = "toast fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition-all duration-300";

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

        toast.classList.remove("hidden", "opacity-0", "translate-x-full");
        toast.classList.add("flex", "opacity-100", "translate-x-0");

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

    // ===============================
    // THEME MANAGEMENT
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
        if (this.PRIVATE_PAGES.includes(currentPage) && !this.currentUser) {
            this.showPage("dashboard");
        }
    }

    getActivePage() {
        let activePage = "dashboard";
        this.dom.navBtns.forEach((btn) => {
            if (btn.classList.contains("active")) {
                activePage = btn.getAttribute("data-page");
            }
        });
        return activePage;
    }

    toggleAuthForms(showRegister = false) {
        if (this.dom.loginForm && this.dom.registerForm) {
            if (showRegister) {
                this.dom.loginForm.classList.add("hidden");
                this.dom.registerForm.classList.remove("hidden");
            } else {
                this.dom.loginForm.classList.remove("hidden");
                this.dom.registerForm.classList.add("hidden");
            }
        }
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
    // DASHBOARD AND ANALYSIS METHODS
    // ===============================
    async loadDashboard() {
        await this.loadEvaluations();
        this.renderStatsSummary();
    }

    renderStatsSummary() {
        const statsEl = document.getElementById("statsSummary");
        if (!statsEl) return;

        const totalGroups = this.state.groups.length;
        const totalStudents = this.state.students.length;
        const totalTasks = this.state.tasks.length;
        const totalEvaluations = this.state.evaluations.length;

        const card = (title, value, icon, color) => `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md flex items-center gap-3 border border-gray-200 dark:border-gray-700">
                <div class="p-3 rounded-lg ${color} text-white"><i class="${icon}"></i></div>
                <div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${title}</div>
                    <div class="text-2xl font-bold text-gray-800 dark:text-white">${value}</div>
                </div>
            </div>
        `;

        statsEl.innerHTML = [
            card("মোট গ্রুপ", totalGroups, "fas fa-layer-group", "bg-blue-500"),
            card("মোট শিক্ষার্থী", totalStudents, "fas fa-user-graduate", "bg-green-500"),
            card("মোট টাস্ক", totalTasks, "fas fa-tasks", "bg-purple-500"),
            card("মোট মূল্যায়ন", totalEvaluations, "fas fa-clipboard-list", "bg-orange-500"),
        ].join("");
    }

    renderGroupMembers() {
        if (!this.dom.groupMembersList) return;

        const filteredStudents = this.getFilteredGroupMembers();
        this.dom.groupMembersList.innerHTML = filteredStudents
            .map((student) => {
                const group = this.state.groups.find((g) => g.id === student.groupId);
                const roleBadge = student.role
                    ? `<span class="px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">${
                        this.roleNames[student.role] || student.role
                    }</span>`
                    : "";

                return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-2">
                                    <h4 class="font-semibold text-gray-800 dark:text-white">${student.name}</h4>
                                    ${roleBadge}
                                </div>
                                <div class="text-sm text-gray-600 dark:text-gray-400">
                                    <p><i class="fas fa-id-card mr-2"></i>রোল: ${student.roll} | গ্রুপ: ${group?.name || "না"}</p>
                                    <p><i class="fas fa-book mr-2"></i>একাডেমিক: ${student.academicGroup || "না"} | সেশন: ${student.session || "না"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("");
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

    renderStudentRanking() {
        if (!this.dom.studentRankingList) return;

        const rankings = this.calculateStudentRankings();
        
        if (rankings.length === 0) {
            this.dom.studentRankingList.innerHTML = '<p class="text-center text-gray-500 py-8">কোন র‌্যাঙ্কিং ডেটা পাওয়া যায়নি</p>';
            return;
        }

        this.dom.studentRankingList.innerHTML = rankings
            .map((rankData, index) => {
                const student = rankData.student;
                const group = this.state.groups.find((g) => g.id === student.groupId);

                return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <span class="rank-badge ${index < 3 ? `rank-${index + 1}` : "rank-other"}">${index + 1}</span>
                                <div>
                                    <h4 class="font-semibold text-gray-800 dark:text-white">${student.name}</h4>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        ${group?.name || "No Group"} | ${student.roll}
                                    </p>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-lg font-bold text-blue-600 dark:text-blue-400">${rankData.averageScore.toFixed(2)}</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">${rankData.evaluationCount} মূল্যায়ন</div>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    calculateStudentRankings() {
        const studentScores = {};

        this.state.students.forEach((student) => {
            studentScores[student.id] = {
                student,
                totalScore: 0,
                evaluationCount: 0,
                averageScore: 0,
            };
        });

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

        Object.values(studentScores).forEach((scoreData) => {
            if (scoreData.evaluationCount > 0) {
                scoreData.averageScore =
                    scoreData.totalScore / scoreData.evaluationCount;
            }
        });

        return Object.values(studentScores)
            .filter((scoreData) => scoreData.evaluationCount > 0)
            .sort((a, b) => b.averageScore - a.averageScore);
    }

    renderGroupAnalysis() {
        // Simple group analysis implementation
        if (!this.dom.groupAnalysisChart) return;

        const scores = this.calculateGroupScores();
        const evaluationCounts = this.computeEvaluationCountMap();

        let content = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        `;

        this.state.groups.forEach((group) => {
            const memberCount = this.getStudentsInGroup(group.id).length;
            const evalCount = evaluationCounts[group.id] || 0;
            const avgScore = scores[group.id] || 0;

            content += `
                <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h4 class="font-semibold text-gray-800 dark:text-white mb-3">${group.name}</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600 dark:text-gray-400">সদস্য সংখ্যা:</span>
                            <span class="font-semibold">${memberCount} জন</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600 dark:text-gray-400">মূল্যায়ন সংখ্যা:</span>
                            <span class="font-semibold">${evalCount} টি</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600 dark:text-gray-400">গড় স্কোর:</span>
                            <span class="font-semibold text-blue-600 dark:text-blue-400">${avgScore.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        content += `</div>`;
        this.dom.groupAnalysisChart.innerHTML = content;
    }

    calculateGroupScores() {
        const groupScores = {};
        this.state.groups.forEach((g) => (groupScores[g.id] = 0));

        this.state.evaluations.forEach((evalItem) => {
            if (evalItem.scores) {
                let groupTotal = 0;
                let studentCount = 0;

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

                    groupTotal += (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                    studentCount++;
                });

                if (studentCount > 0 && evalItem.groupId) {
                    groupScores[evalItem.groupId] = groupTotal / studentCount;
                }
            }
        });

        return groupScores;
    }

    getStudentsInGroup(groupId) {
        return this.state.students.filter((student) => student.groupId === groupId);
    }

    // ===============================
    // EVALUATION SYSTEM
    // ===============================
    startEvaluation() {
        const taskId = this.dom.evaluationTaskSelect?.value;
        const groupId = this.dom.evaluationGroupSelect?.value;

        if (!taskId || !groupId) {
            this.showToast("টাস্ক এবং গ্রুপ নির্বাচন করুন", "error");
            return;
        }

        this.showToast("মূল্যায়ন সিস্টেম প্রস্তুত", "info");
    }

    refreshRanking() {
        this.cache.clear("evaluations_data");
        this.loadEvaluations().then(() => {
            this.renderStudentRanking();
            this.showToast("র‌্যাঙ্কিং রিফ্রেশ করা হয়েছে", "success");
        });
    }

    // ===============================
    // EXPORT METHODS
    // ===============================
    async exportAllData() {
        this.showLoading("এক্সপোর্ট তৈরি হচ্ছে...");
        try {
            const exportData = {
                groups: this.state.groups,
                students: this.state.students,
                tasks: this.state.tasks,
                evaluations: this.state.evaluations,
                exportedAt: new Date().toISOString(),
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `smart_evaluator_backup_${new Date().toISOString().split("T")[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showToast("সমস্ত ডেটা সফলভাবে এক্সপোর্ট করা হয়েছে", "success");
        } catch (error) {
            this.showToast("এক্সপোর্ট ব্যর্থ: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }
}

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    window.smartEvaluator = new SmartGroupEvaluator();
});