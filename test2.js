// test.js - COMPLETE FIXED VERSION BASED ON app.js
class TestEvaluator {
    constructor() {
        this.currentUser = null;
        this.isPublicMode = true;
        this.isInitialized = false;
        
        this.state = {
            groups: [],
            students: [],
            tasks: [],
            evaluations: [],
            admins: []
        };

        this.filters = {
            membersFilterGroupId: "",
            membersSearchTerm: "",
            cardsFilterGroupId: "", 
            cardsSearchTerm: "",
            groupMembersFilterGroupId: "",
            analysisFilterGroupIds: [],
            adminSearchTerm: ""
        };

        this.PUBLIC_PAGES = ['dashboard', 'all-students', 'group-policy', 'export', 'student-ranking', 'group-analysis'];
        this.PRIVATE_PAGES = ['groups', 'members', 'group-members', 'tasks', 'evaluation', 'admin-management'];

        this.deleteCallback = null;
        this.editCallback = null;
        this.csvImportData = null;

        this.init();
    }

    async init() {
        this.setupDOMReferences();
        await this.initializeFirebase();
        this.setupEventListeners();
        this.setupAuthStateListener();
        this.applySavedTheme();
        this.isInitialized = true;
    }

    async initializeFirebase() {
        try {
            await db.collection('groups').limit(1).get();
            console.log('Firebase connected successfully');
        } catch (error) {
            console.error('Firebase connection failed:', error);
            this.showToast('ডেটাবেস সংযোগ ব্যর্থ', 'error');
        }
    }

    setupDOMReferences() {
        // Core DOM elements
        this.dom = {
            // Auth elements
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
            
            // Theme and navigation
            themeToggle: document.getElementById("themeToggle"),
            mobileMenuBtn: document.getElementById("mobileMenuBtn"),
            sidebar: document.querySelector(".sidebar"),
            pageTitle: document.getElementById("pageTitle"),
            userInfo: document.getElementById("userInfo"),
            
            // Pages
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
            
            // Loading and toast
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

            // CSV Import/Export
            csvFileInput: document.getElementById("csvFileInput"),
            importStudentsBtn: document.getElementById("importStudentsBtn"),
            processImportBtn: document.getElementById("processImportBtn"),
            csvFileName: document.getElementById("csvFileName"),
            downloadTemplateBtn: document.getElementById("downloadTemplateBtn"),
            exportAllData: document.getElementById("exportAllData"),
            exportStudentsCSV: document.getElementById("exportStudentsCSV"),
            exportGroupsCSV: document.getElementById("exportGroupsCSV"),
            exportEvaluationsCSV: document.getElementById("exportEvaluationsCSV"),

            // Search and filter
            membersFilterGroup: document.getElementById("membersFilterGroup"),
            studentSearchInput: document.getElementById("studentSearchInput"),
            cardsFilterGroup: document.getElementById("cardsFilterGroup"),
            allStudentsSearchInput: document.getElementById("allStudentsSearchInput"),
            groupMembersGroupSelect: document.getElementById("groupMembersGroupSelect"),
            groupMembersList: document.getElementById("groupMembersList")
        };
    }

    setupEventListeners() {
        // Auth events
        this.addListener(this.dom.showRegister, 'click', () => this.toggleAuthForms());
        this.addListener(this.dom.showLogin, 'click', () => this.toggleAuthForms(false));
        this.addListener(this.dom.loginBtn, 'click', () => this.handleLogin());
        this.addListener(this.dom.registerBtn, 'click', () => this.handleRegister());
        this.addListener(this.dom.googleSignInBtn, 'click', () => this.handleGoogleSignIn());

        // Logout events
        this.addListener(this.dom.logoutBtn, 'click', () => this.showLogoutModal());
        this.addListener(this.dom.cancelLogout, 'click', () => this.hideLogoutModal());
        this.addListener(this.dom.confirmLogout, 'click', () => this.handleLogout());

        // Modal events
        this.addListener(this.dom.cancelDelete, 'click', () => this.hideDeleteModal());
        this.addListener(this.dom.confirmDelete, 'click', () => {
            if (this.deleteCallback) this.deleteCallback();
            this.hideDeleteModal();
        });
        this.addListener(this.dom.cancelEdit, 'click', () => this.hideEditModal());
        this.addListener(this.dom.saveEdit, 'click', () => {
            if (this.editCallback) this.editCallback();
            this.hideEditModal();
        });

        // Theme and mobile menu
        this.addListener(this.dom.themeToggle, 'click', () => this.toggleTheme());
        this.addListener(this.dom.mobileMenuBtn, 'click', () => this.toggleMobileMenu());

        // Navigation
        this.dom.navBtns.forEach(btn => {
            this.addListener(btn, 'click', (e) => this.handleNavigation(e));
        });

        // CRUD Operations
        this.addListener(this.dom.addGroupBtn, 'click', () => this.addGroup());
        this.addListener(this.dom.addStudentBtn, 'click', () => this.addStudent());

        // CSV Operations
        this.addListener(this.dom.importStudentsBtn, 'click', () => this.importCSV());
        this.addListener(this.dom.processImportBtn, 'click', () => this.processCSVImport());
        this.addListener(this.dom.csvFileInput, 'change', (e) => this.handleCSVFileSelect(e));
        this.addListener(this.dom.downloadTemplateBtn, 'click', () => this.downloadCSVTemplate());

        // Export Operations
        this.addListener(this.dom.exportAllData, 'click', () => this.exportAllData());
        this.addListener(this.dom.exportStudentsCSV, 'click', () => this.exportStudentsCSV());
        this.addListener(this.dom.exportGroupsCSV, 'click', () => this.exportGroupsCSV());
        this.addListener(this.dom.exportEvaluationsCSV, 'click', () => this.exportEvaluationsCSV());

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
        // Search functionality
        const searchInputs = [
            { id: 'studentSearchInput', callback: (value) => this.handleStudentSearch(value) },
            { id: 'allStudentsSearchInput', callback: (value) => this.handleAllStudentsSearch(value) }
        ];

        searchInputs.forEach(({id, callback}) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', (e) => {
                    setTimeout(() => callback(e.target.value), 300);
                });
            }
        });

        // Filter events
        const groupFilters = [
            { id: 'membersFilterGroup', callback: (value) => this.handleMembersFilter(value) },
            { id: 'cardsFilterGroup', callback: (value) => this.handleCardsFilter(value) },
            { id: 'groupMembersGroupSelect', callback: (value) => this.handleGroupMembersFilter(value) }
        ];

        groupFilters.forEach(({id, callback}) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', (e) => callback(e.target.value));
            }
        });
    }

    setupModalCloseHandlers() {
        const modals = [
            this.dom.authModal, this.dom.deleteModal, this.dom.editModal, this.dom.logoutModal
        ];
        
        modals.forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideModal(modal);
                    }
                });
            }
        });
    }

    // ===============================
    // AUTHENTICATION - FIXED VERSION
    // ===============================
    setupAuthStateListener() {
        auth.onAuthStateChanged(async (user) => {
            console.log('Auth State Changed:', user);
            this.currentUser = user;
            
            if (user) {
                await this.handleAutoLogin(user);
            } else {
                await this.handleAutoLogout();
            }
        });
    }

    async handleAutoLogin(user) {
        this.isPublicMode = false;
        
        // Update UI immediately
        this.updateAuthUI(false);
        
        try {
            const userData = await this.getUserAdminData(user);
            this.updateUserInterface(userData);
            await this.loadInitialData();
            this.showToast(`স্বয়ংক্রিয় লগইন সফল! ${user.email}`, 'success');
        } catch (error) {
            console.error("Auto login handling error:", error);
            this.showToast('স্বয়ংক্রিয় লগইন সম্পন্ন কিন্তু ডেটা লোড করতে সমস্যা', 'warning');
        }
    }

    async handleAutoLogout() {
        this.isPublicMode = true;
        this.currentUser = null;
        
        // Update UI immediately
        this.updateAuthUI(true);
        
        // Reset UI state
        this.updateUserInterface(null);
        
        // Load public data
        await this.loadPublicData();
        
        this.showToast('স্বয়ংক্রিয় লগআউট সম্পন্ন', 'info');
    }

    updateAuthUI(showAuthModal) {
        if (showAuthModal) {
            if (this.dom.authModal) this.dom.authModal.classList.remove('hidden');
            if (this.dom.appContainer) this.dom.appContainer.classList.add('hidden');
        } else {
            if (this.dom.authModal) this.dom.authModal.classList.add('hidden');
            if (this.dom.appContainer) this.dom.appContainer.classList.remove('hidden');
        }
    }

    async handleLogin() {
        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;
        
        if (!email || !password) {
            this.showToast("ইমেইল এবং পাসওয়ার্ড প্রয়োজন", "error");
            return;
        }

        this.showLoading();
        try {
            await auth.signInWithEmailAndPassword(email, password);
            if (document.getElementById("loginEmail")) document.getElementById("loginEmail").value = '';
            if (document.getElementById("loginPassword")) document.getElementById("loginPassword").value = '';
        } catch (error) {
            this.handleAuthError(error, 'login');
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
                type: adminType,
                permissions: {
                    read: true,
                    write: true,
                    delete: adminType === 'super-admin'
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            this.showToast("রেজিস্ট্রেশন সফল!", "success");
            this.toggleAuthForms(false);
            
            if (document.getElementById("registerEmail")) document.getElementById("registerEmail").value = '';
            if (document.getElementById("registerPassword")) document.getElementById("registerPassword").value = '';
            
        } catch (error) {
            this.handleAuthError(error, 'register');
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
                    type: "admin",
                    permissions: {
                        read: true,
                        write: true,
                        delete: false
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            }
            this.showToast('Google লগইন সফল!', 'success');
        } catch (error) {
            this.handleAuthError(error, 'google');
        } finally {
            this.hideLoading();
        }
    }

    handleAuthError(error, type) {
        let errorMessage = "";
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = "এই ইমেইলে কোনো অ্যাকাউন্ট নেই";
                break;
            case 'auth/wrong-password':
                errorMessage = "ভুল পাসওয়ার্ড";
                break;
            case 'auth/invalid-email':
                errorMessage = "অবৈধ ইমেইল ঠিকানা";
                break;
            case 'auth/email-already-in-use':
                errorMessage = "এই ইমেইল ইতিমধ্যে ব্যবহার করা হয়েছে";
                break;
            case 'auth/weak-password':
                errorMessage = "পাসওয়ার্ড খুব দুর্বল";
                break;
            default:
                errorMessage = `${type === 'login' ? 'লগইন' : 'রেজিস্ট্রেশন'} ব্যর্থ: ${error.message}`;
        }
        
        this.showToast(errorMessage, "error");
    }

    async handleLogout() {
        try {
            await auth.signOut();
            this.hideLogoutModal();
        } catch (error) {
            this.showToast("লগআউট করতে সমস্যা: " + error.message, "error");
        }
    }

    async getUserAdminData(user) {
        try {
            const byUid = await db.collection("admins").doc(user.uid).get();
            if (byUid.exists) {
                return byUid.data();
            }

            const byEmailSnap = await db.collection("admins").where("email", "==", user.email).limit(1).get();
            if (!byEmailSnap.empty) {
                return byEmailSnap.docs[0].data();
            }

            return {
                email: user.email,
                type: "user",
                permissions: { read: true, write: false, delete: false }
            };
        } catch (error) {
            console.error("Error fetching admin data:", error);
            return {
                email: user.email,
                type: "user",
                permissions: { read: true, write: false, delete: false }
            };
        }
    }

    // ===============================
    // PUBLIC/PRIVATE PAGE MANAGEMENT - FIXED
    // ===============================
    async loadPublicData() {
        this.showLoading();
        try {
            await Promise.all([
                this.loadGroups(),
                this.loadStudents()
            ]);
            this.populateSelects();
            
            if (document.getElementById('page-dashboard') && !document.getElementById('page-dashboard').classList.contains('hidden')) {
                await this.loadDashboard();
            }
            
        } catch (error) {
            console.error("Public data load error:", error);
            this.showToast('পাবলিক ডেটা লোড করতে সমস্যা', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async loadInitialData() {
        this.showLoading();
        try {
            await Promise.all([
                this.loadGroups(),
                this.loadStudents(),
                this.loadTasks(),
                this.loadEvaluations()
            ]);
            this.populateSelects();
        } catch (error) {
            console.error("Initial data load error:", error);
            this.showToast("ডেটা লোড করতে সমস্যা", "error");
        } finally {
            this.hideLoading();
        }
    }

    async handleNavigation(event) {
        const btn = event.currentTarget;
        const pageId = btn.getAttribute("data-page");

        // Check authentication for private pages - FIXED
        if (!this.currentUser && this.PRIVATE_PAGES.includes(pageId)) {
            this.showToast("এই পেজ দেখতে লগইন প্রয়োজন", "error");
            return;
        }

        // Update navigation
        this.dom.navBtns.forEach(navBtn => {
            navBtn.classList.remove("active");
        });
        btn.classList.add("active");

        // Show page with authentication check
        this.dom.pages.forEach(page => {
            const pageIdAttr = page.id.replace('page-', '');
            if (pageIdAttr === pageId) {
                // Check if page requires authentication
                if (this.PRIVATE_PAGES.includes(pageId) && !this.currentUser) {
                    page.classList.add("hidden");
                } else {
                    page.classList.remove("hidden");
                }
            } else {
                page.classList.add("hidden");
            }
        });

        if (this.dom.pageTitle) this.dom.pageTitle.textContent = btn.textContent.trim();

        // Load page-specific data
        switch(pageId) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'groups':
                this.renderGroups();
                break;
            case 'members':
                this.renderStudentsList();
                break;
            case 'group-members':
                this.renderGroupMembers();
                break;
            case 'all-students':
                this.renderStudentCards();
                break;
            case 'export':
                // Export page doesn't need additional loading
                break;
        }
    }

    updateUserInterface(userData) {
        if (!this.dom.userInfo || !this.dom.logoutBtn) return;

        if (userData && this.currentUser) {
            // User is logged in
            this.dom.userInfo.innerHTML = `
                <div class="font-medium">${userData.email}</div>
                <div class="text-xs ${userData.type === "super-admin" ? "text-purple-600" : "text-gray-500"}">
                    ${userData.type === "super-admin" ? "সুপার অ্যাডমিন" : userData.type === "admin" ? "অ্যাডমিন" : "ব্যবহারকারী"}
                </div>
            `;
            
            this.dom.logoutBtn.classList.remove('hidden');
            document.body.classList.add('user-logged-in');

            // Show private-only elements
            document.querySelectorAll('.private-only').forEach(el => {
                el.classList.remove('hidden');
            });

        } else {
            // User is logged out
            this.dom.userInfo.innerHTML = `<div class="text-xs text-gray-500">সাধারণ ব্যবহারকারী</div>`;
            this.dom.logoutBtn.classList.add('hidden');
            document.body.classList.remove('user-logged-in');

            // Hide private-only elements
            document.querySelectorAll('.private-only').forEach(el => {
                el.classList.add('hidden');
            });
        }
    }

    // ===============================
    // CSV IMPORT/EXPORT - FIXED VERSION
    // ===============================
    importCSV() {
        if (!this.currentUser) {
            this.showToast("CSV ইম্পোর্ট করতে লগইন প্রয়োজন", "error");
            return;
        }
        this.dom.csvFileInput.click();
    }

    async handleCSVFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check file type
        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showToast('শুধুমাত্র CSV ফাইল নির্বাচন করুন', 'error');
            return;
        }

        this.dom.csvFileName.textContent = file.name;
        this.dom.processImportBtn.classList.remove('hidden');

        // Parse CSV file
        Papa.parse(file, {
            header: true,
            complete: (results) => {
                if (results.data && results.data.length > 0) {
                    this.csvImportData = results.data;
                    this.showToast(`${results.data.length}টি শিক্ষার্থীর ডেটা লোড হয়েছে`, 'success');
                } else {
                    this.showToast('CSV ফাইলে কোনো ডেটা নেই', 'error');
                }
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

        if (!this.currentUser) {
            this.showToast("ইম্পোর্ট করতে লগইন প্রয়োজন", "error");
            return;
        }

        this.showLoading('শিক্ষার্থী ইম্পোর্ট হচ্ছে...');
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const studentData of this.csvImportData) {
                try {
                    // Validate required fields
                    if (!studentData.নাম || !studentData.রোল) {
                        errorCount++;
                        continue;
                    }

                    // Find group by name
                    let groupId = '';
                    if (studentData.গ্রুপ) {
                        const group = this.state.groups.find(g => g.name === studentData.গ্রুপ);
                        if (group) {
                            groupId = group.id;
                        }
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
                        groupId: groupId,
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
                    console.error('Error importing student:', error);
                    errorCount++;
                }
            }

            // Clear cache and reload data
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
        if (!this.currentUser) {
            this.showToast("CSV এক্সপোর্ট করতে লগইন প্রয়োজন", "error");
            return;
        }

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
                    this.getRoleDisplayName(student.role) || '',
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
        if (!this.currentUser) {
            this.showToast("CSV এক্সপোর্ট করতে লগইন প্রয়োজন", "error");
            return;
        }

        this.showLoading();
        try {
            const headers = ['গ্রুপ নাম', 'সদস্য সংখ্যা'];
            const memberCountMap = this.computeMemberCountMap();
            
            const data = this.state.groups.map(group => [
                group.name,
                memberCountMap[group.id] || 0
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
        if (!this.currentUser) {
            this.showToast("CSV এক্সপোর্ট করতে লগইন প্রয়োজন", "error");
            return;
        }

        this.showLoading();
        try {
            const headers = ['টাস্ক', 'গ্রুপ', 'শিক্ষার্থী', 'টাস্ক স্কোর', 'টিমওয়ার্ক স্কোর', 'মোট স্কোর', 'মন্তব্য'];
            const data = [];

            this.state.evaluations.forEach(evalItem => {
                const task = this.state.tasks.find(t => t.id === evalItem.taskId);
                const group = this.state.groups.find(g => g.id === evalItem.groupId);
                
                if (evalItem.scores) {
                    Object.entries(evalItem.scores).forEach(([studentId, score]) => {
                        const student = this.state.students.find(s => s.id === studentId);
                        if (student) {
                            const total = (score.taskScore || 0) + (score.teamworkScore || 0);
                            
                            data.push([
                                task?.name || 'Unknown',
                                group?.name || 'Unknown',
                                student.name,
                                score.taskScore || 0,
                                score.teamworkScore || 0,
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
        if (!this.currentUser) {
            this.showToast("এক্সপোর্ট করতে লগইন প্রয়োজন", "error");
            return;
        }

        this.showLoading('ডেটা এক্সপোর্ট হচ্ছে...');
        
        try {
            // Create ZIP file with all CSV files
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

    // ===============================
    // DATA MANAGEMENT
    // ===============================
    async loadGroups() {
        try {
            const snap = await db.collection("groups").orderBy("name").get();
            this.state.groups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.renderGroups();
        } catch (error) {
            console.error("Error loading groups:", error);
            this.showToast('গ্রুপ লোড করতে সমস্যা', 'error');
        }
    }

    async loadStudents() {
        try {
            const snap = await db.collection("students").orderBy("name").get();
            this.state.students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.renderStudentsList();
            this.renderStudentCards();
        } catch (error) {
            console.error("Error loading students:", error);
            this.showToast('শিক্ষার্থী লোড করতে সমস্যা', 'error');
        }
    }

    async loadTasks() {
        try {
            const snap = await db.collection("tasks").orderBy("date", "desc").get();
            this.state.tasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error loading tasks:", error);
            this.showToast('টাস্ক লোড করতে সমস্যা', 'error');
        }
    }

    async loadEvaluations() {
        try {
            const snap = await db.collection("evaluations").get();
            this.state.evaluations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error loading evaluations:", error);
            this.showToast('মূল্যায়ন লোড করতে সমস্যা', 'error');
        }
    }

    populateSelects() {
        // Populate student group select
        if (this.dom.studentGroupInput) {
            this.dom.studentGroupInput.innerHTML = this.state.groups.map(g => 
                `<option value="${g.id}">${g.name}</option>`
            ).join('');
        }

        // Populate filter selects
        const filterSelects = ['membersFilterGroup', 'cardsFilterGroup', 'groupMembersGroupSelect'];
        filterSelects.forEach(selectId => {
            const element = document.getElementById(selectId);
            if (element) {
                element.innerHTML = '<option value="">সকল গ্রুপ</option>' + 
                    this.state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            }
        });
    }

    // ===============================
    // RENDERING METHODS
    // ===============================
    renderGroups() {
        if (!this.dom.groupsList) return;
        
        const memberCountMap = this.computeMemberCountMap();
        
        this.dom.groupsList.innerHTML = this.state.groups.map(group => `
            <div class="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                    <div class="font-medium">${group.name}</div>
                    <div class="text-sm text-gray-500">সদস্য: ${memberCountMap[group.id] || 0} জন</div>
                </div>
                <div class="flex gap-2">
                    ${this.currentUser ? `
                        <button onclick="testEvaluator.editGroup('${group.id}')" class="edit-group-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                        <button onclick="testEvaluator.deleteGroup('${group.id}')" class="delete-group-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                    ` : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'}
                </div>
            </div>
        `).join('');
    }

    renderStudentsList() {
        if (!this.dom.studentsList) return;

        const filteredStudents = this.getFilteredStudents();
        
        this.dom.studentsList.innerHTML = filteredStudents.map(student => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            return `
                <div class="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                        <div class="font-medium">${student.name}</div>
                        <div class="text-sm text-gray-500">রোল: ${student.roll} | লিঙ্গ: ${student.gender} | গ্রুপ: ${group?.name || 'না'}</div>
                        <div class="text-sm text-gray-500">একাডেমিক: ${student.academicGroup || 'না'} | সেশন: ${student.session || 'না'}</div>
                    </div>
                    <div class="flex gap-2">
                        ${this.currentUser ? `
                            <button onclick="testEvaluator.editStudent('${student.id}')" class="edit-student-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                            <button onclick="testEvaluator.deleteStudent('${student.id}')" class="delete-student-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                        ` : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderStudentCards() {
        if (!this.dom.allStudentsCards) return;

        const filteredStudents = this.getFilteredStudents('cards');
        
        this.dom.allStudentsCards.innerHTML = filteredStudents.map((student, index) => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            const bgClass = `student-card-bg-${(index % 8) + 1}`;
            
            return `
                <div class="student-card ${bgClass} rounded-xl p-4 shadow-md relative overflow-hidden">
                    <span class="serial-number">${index + 1}</span>
                    <div class="flex items-start mb-3">
                        <div class="student-avatar ${student.gender === 'মেয়ে' ? 'bg-pink-500' : 'bg-blue-500'}">
                            ${student.name.charAt(0)}
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-lg">${student.name}</h3>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-2 text-sm">
                        <p><i class="fas fa-id-card mr-2"></i> রোল: ${student.roll}</p>
                        <p><i class="fas fa-venus-mars mr-2"></i> লিঙ্গ: ${student.gender}</p>
                        <p><i class="fas fa-users mr-2"></i> গ্রুপ: ${group?.name || 'না'}</p>
                        <p><i class="fas fa-book mr-2"></i> একাডেমিক: ${student.academicGroup || 'না'}</p>
                        <p><i class="fas fa-calendar mr-2"></i> সেশন: ${student.session || 'না'}</p>
                        ${student.contact ? `<p><i class="fas fa-envelope mr-2"></i> ${student.contact}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderGroupMembers() {
        if (!this.dom.groupMembersList) return;

        const groupId = this.filters.groupMembersFilterGroupId || '';
        let students = this.state.students;
        
        if (groupId) {
            students = students.filter(s => s.groupId === groupId);
        }

        this.dom.groupMembersList.innerHTML = students.map(student => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            return `
                <div class="flex justify-between items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div class="flex-1">
                        <div class="font-medium">${student.name}</div>
                        <div class="text-sm text-gray-500">
                            রোল: ${student.roll} | গ্রুপ: ${group?.name || 'না'} | 
                            একাডেমিক: ${student.academicGroup || 'না'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
            await this.loadGroups();
            this.showToast('গ্রুপ সফলভাবে যোগ করা হয়েছে', 'success');
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
            const isDuplicate = await this.checkStudentUniqueness(studentData.roll, studentData.academicGroup);
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
            await this.loadStudents();
            this.renderGroups();
            this.showToast('শিক্ষার্থী সফলভাবে যোগ করা হয়েছে', 'success');
        } catch (error) {
            this.showToast("শিক্ষার্থী যোগ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // HELPER METHODS
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
            role
        };
    }

    clearStudentForm() {
        const fields = [
            'studentNameInput', 'studentRollInput', 'studentContactInput', 
            'studentAcademicGroupInput', 'studentSessionInput'
        ];
        fields.forEach(field => {
            if (this.dom[field]) this.dom[field].value = '';
        });
    }

    computeMemberCountMap() {
        const map = {};
        this.state.groups.forEach(g => { map[g.id] = 0; });
        this.state.students.forEach(s => {
            if (s.groupId) map[s.groupId] = (map[s.groupId] || 0) + 1;
        });
        return map;
    }

    getFilteredStudents(type = 'members') {
        let students = this.state.students;
        
        if (type === 'members') {
            if (this.filters.membersFilterGroupId) {
                students = students.filter(s => s.groupId === this.filters.membersFilterGroupId);
            }
            
            if (this.filters.membersSearchTerm) {
                const term = this.filters.membersSearchTerm.toLowerCase();
                students = students.filter(s => 
                    s.name.toLowerCase().includes(term) ||
                    s.roll.toLowerCase().includes(term) ||
                    (s.academicGroup && s.academicGroup.toLowerCase().includes(term))
                );
            }
        } else if (type === 'cards') {
            if (this.filters.cardsFilterGroupId) {
                students = students.filter(s => s.groupId === this.filters.cardsFilterGroupId);
            }
            
            if (this.filters.cardsSearchTerm) {
                const term = this.filters.cardsSearchTerm.toLowerCase();
                students = students.filter(s => 
                    s.name.toLowerCase().includes(term) ||
                    s.roll.toLowerCase().includes(term) ||
                    (s.academicGroup && s.academicGroup.toLowerCase().includes(term))
                );
            }
        }
        
        return students;
    }

    async checkStudentUniqueness(roll, academicGroup, excludeId = null) {
        const query = db.collection("students")
            .where("roll", "==", roll)
            .where("academicGroup", "==", academicGroup);
        const snap = await query.get();
        return !snap.empty && snap.docs.some(doc => doc.id !== excludeId);
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

    getRoleDisplayName(roleKey) {
        const roleMap = {
            'team-leader': 'টিম লিডার',
            'time-keeper': 'টাইম কিপার',
            'reporter': 'রিপোর্টার',
            'resource-manager': 'রিসোর্স ম্যানেজার',
            'peace-maker': 'পিস মেকার'
        };
        return roleMap[roleKey] || '';
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
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
    // UI MANAGEMENT
    // ===============================
    toggleAuthForms(showRegister = true) {
        if (this.dom.loginForm && this.dom.registerForm) {
            if (showRegister) {
                this.dom.loginForm.classList.add('hidden');
                this.dom.registerForm.classList.remove('hidden');
            } else {
                this.dom.loginForm.classList.remove('hidden');
                this.dom.registerForm.classList.add('hidden');
            }
        }
    }

    toggleTheme() {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
    }

    applySavedTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    toggleMobileMenu() {
        if (this.dom.sidebar) {
            this.dom.sidebar.classList.toggle('hidden');
        }
    }

    showLoading(message = "লোড হচ্ছে...") {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.classList.remove("hidden");
            const messageEl = this.dom.loadingOverlay.querySelector('p');
            if (messageEl) messageEl.textContent = message;
        }
    }

    hideLoading() {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.classList.add("hidden");
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
    // TOAST NOTIFICATIONS
    // ===============================
    showToast(message, type = 'success') {
        const toast = this.dom.toast;
        const toastMessage = this.dom.toastMessage;
        
        if (!toast || !toastMessage) return;

        toastMessage.textContent = message;
        
        toast.className = 'toast fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition-all duration-300';
        
        switch(type) {
            case 'success':
                toast.classList.add('bg-green-500', 'text-white');
                break;
            case 'error':
                toast.classList.add('bg-red-500', 'text-white');
                break;
            case 'warning':
                toast.classList.add('bg-yellow-500', 'text-white');
                break;
            case 'info':
                toast.classList.add('bg-blue-500', 'text-white');
                break;
        }

        toast.classList.remove('hidden', 'opacity-0', 'translate-x-full');
        toast.classList.add('flex', 'opacity-100', 'translate-x-0');

        setTimeout(() => {
            this.hideToast();
        }, 4000);
    }

    hideToast() {
        const toast = this.dom.toast;
        if (toast) {
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => {
                toast.classList.add('hidden');
                toast.classList.remove('flex', 'opacity-100', 'translate-x-0');
            }, 300);
        }
    }

    // ===============================
    // DASHBOARD METHODS
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
        const academicGroups = new Set(this.state.students.map(s => s.academicGroup)).size;

        const genderCount = { 'ছেলে': 0, 'মেয়ে': 0 };
        this.state.students.forEach(s => {
            if (s.gender === 'ছেলে') genderCount['ছেলে']++;
            else if (s.gender === 'মেয়ে') genderCount['মেয়ে']++;
        });

        const card = (title, value, icon, color) => `
            <div class="glass-card rounded-xl p-4 shadow-md flex items-center gap-3 card-hover">
                <div class="p-3 rounded-lg ${color} text-white"><i class="${icon}"></i></div>
                <div>
                    <div class="text-xs text-gray-500 dark:text-gray-300">${title}</div>
                    <div class="text-2xl font-bold">${value}</div>
                </div>
            </div>
        `;

        statsEl.innerHTML = [
            card("মোট গ্রুপ", totalGroups, "fas fa-layer-group", "bg-blue-500"),
            card("মোট শিক্ষার্থী", totalStudents, "fas fa-user-graduate", "bg-green-500"),
            card("একাডেমিক গ্রুপ", academicGroups, "fas fa-book", "bg-purple-500"),
            card("ছেলে", genderCount['ছেলে'], "fas fa-male", "bg-blue-400"),
            card("মেয়ে", genderCount['মেয়ে'], "fas fa-female", "bg-pink-400")
        ].join("");
    }

    // ===============================
    // CSV GENERATION HELPERS
    // ===============================
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
                this.getRoleDisplayName(student.role) || '',
                student.contact || ''
            ];
        });

        return [headers, ...data]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    async generateGroupsCSV() {
        const headers = ['গ্রুপ নাম', 'সদস্য সংখ্যা'];
        const memberCountMap = this.computeMemberCountMap();
        
        const data = this.state.groups.map(group => [
            group.name,
            memberCountMap[group.id] || 0
        ]);

        return [headers, ...data]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    async generateEvaluationsCSV() {
        const headers = ['টাস্ক', 'গ্রুপ', 'শিক্ষার্থী', 'টাস্ক স্কোর', 'টিমওয়ার্ক স্কোর', 'মোট স্কোর', 'মন্তব্য'];
        const data = [];

        this.state.evaluations.forEach(evalItem => {
            const task = this.state.tasks.find(t => t.id === evalItem.taskId);
            const group = this.state.groups.find(g => g.id === evalItem.groupId);
            
            if (evalItem.scores) {
                Object.entries(evalItem.scores).forEach(([studentId, score]) => {
                    const student = this.state.students.find(s => s.id === studentId);
                    if (student) {
                        const total = (score.taskScore || 0) + (score.teamworkScore || 0);
                        
                        data.push([
                            task?.name || 'Unknown',
                            group?.name || 'Unknown',
                            student.name,
                            score.taskScore || 0,
                            score.teamworkScore || 0,
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
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.testEvaluator = new TestEvaluator();
});