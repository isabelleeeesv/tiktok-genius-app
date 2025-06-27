import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut 
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    arrayUnion, 
    arrayRemove, 
    serverTimestamp,
    onSnapshot
} from 'firebase/firestore';
import { Sparkles, Copy, Lightbulb, TrendingUp, Film, CheckCircle, Star, Music, FileText, X, Lock, Settings } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Analytics } from '@vercel/analytics/react';

// --- CONSTANTS ---
const VITE_FIREBASE_CONFIG = import.meta.env.VITE_FIREBASE_CONFIG;
const VITE_APP_ID = import.meta.env.VITE_APP_ID;
const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const VITE_STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const VITE_STRIPE_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID;
const VITE_MAILERLITE_API_KEY = import.meta.env.VITE_MAILERLITE_API_KEY;
const VITE_MAILERLITE_LIST_ID = import.meta.env.VITE_MAILERLITE_LIST_ID; // Set this in your .env
const DAILY_FREE_LIMIT = 3;

// --- MAIN APP COMPONENT ---
const App = () => {
    // --- STATE MANAGEMENT ---
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [currentPage, setCurrentPage] = useState('generator');
    const [firebaseError, setFirebaseError] = useState(null);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [guestGenerations, setGuestGenerations] = useState({ count: 0, lastReset: '' });
    const [showOnboarding, setShowOnboarding] = useState(false);

    const navigate = useCallback((page) => setCurrentPage(page), []);
    
    // --- GUEST GENERATION TRACKING ---
    useEffect(() => {
        if (!user) {
            const stored = JSON.parse(localStorage.getItem('guestGenerations') || '{}');
            const today = new Date().toISOString().split('T')[0];
            if (stored.lastReset !== today) {
                const newState = { count: 0, lastReset: today };
                setGuestGenerations(newState);
                localStorage.setItem('guestGenerations', JSON.stringify(newState));
            } else {
                setGuestGenerations(stored);
            }
        }
    }, [user]);

    // --- FIREBASE INITIALIZATION & AUTHENTICATION ---
    useEffect(() => {
        try {
            const firebaseConfigStr = VITE_FIREBASE_CONFIG || (typeof __firebase_config !== 'undefined' ? __firebase_config : null);

            if (!firebaseConfigStr) {
                 setFirebaseError("Firebase configuration is missing. The app cannot start.");
                 setIsAuthReady(true);
                 return;
            }
            const firebaseConfig = JSON.parse(firebaseConfigStr);
            
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribeAuth = onAuthStateChanged(authInstance, (currentUser) => {
                setUser(currentUser);
                if (!isAuthReady) {
                   setIsAuthReady(true);
                }
            });

            return () => unsubscribeAuth();
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            setFirebaseError(`Failed to initialize Firebase services: ${error.message}`);
            setIsAuthReady(true);
        }
    }, []); 

    // --- REAL-TIME USER DATA LISTENER ---
    useEffect(() => {
        let unsubscribeDb = () => {};
        if (user && db) {
            const appId = VITE_APP_ID || (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id');
            const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);

            unsubscribeDb = onSnapshot(userDocRef, 
                async (docSnap) => { 
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setUserData(data);
                        if (data?.subscription?.status === 'active' && currentPage === 'pricing') {
                            navigate('generator');
                        }
                    } else if (user && !user.isAnonymous) { // Only create doc if a real user is logged in
                        const initialData = {
                            email: user.email,
                            createdAt: serverTimestamp(),
                            generations: { count: 0, lastReset: new Date().toISOString().split('T')[0] },
                            favorites: [],
                            subscription: { status: 'free' }
                        };
                        try {
                           await setDoc(userDocRef, initialData);
                           setUserData(initialData);
                        } catch(e) {
                           console.error("Error creating user document:", e);
                           setFirebaseError("Could not create user profile.");
                        }
                    }
                },
                (error) => { 
                    console.error("Error fetching user data with onSnapshot:", error);
                    setFirebaseError("Could not retrieve user profile.");
                }
            );
        } else {
            setUserData(null); // Clear user data on logout
        }
        return () => unsubscribeDb();
    }, [user, db, currentPage, navigate]); 
    
    // --- HANDLE STRIPE REDIRECT ---
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);

        if (query.get("payment_success")) {
             window.history.replaceState(null, '', window.location.pathname);
             navigate('generator');
        }

        if (query.get("payment_canceled")) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, [navigate]);

    // --- ONBOARDING ---
    useEffect(() => {
        if (!localStorage.getItem('seenOnboarding')) {
            setShowOnboarding(true);
            localStorage.setItem('seenOnboarding', 'true');
        }
    }, []);
    
    // --- SCROLL LOCK FOR MODALS (MOBILE UX) ---
    useEffect(() => {
        const modalOpen = showOnboarding || showLoginModal;
        if (modalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        // Clean up on unmount
        return () => { document.body.style.overflow = ''; };
    }, [showOnboarding, showLoginModal]);

    // --- BODY SCROLL LOCK FOR MODALS (MOBILE-FRIENDLY) ---
    useEffect(() => {
        const modalOpen = showOnboarding || showLoginModal;
        if (modalOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        // Clean up on unmount
        return () => document.body.classList.remove('modal-open');
    }, [showOnboarding, showLoginModal]);

    // --- RENDER LOGIC ---
    if (!isAuthReady) {
        return <LoadingScreen />;
    }
    
    if (firebaseError) {
        return <ErrorScreen message={firebaseError} />
    }

    const renderPage = () => {
        // Always show the generator tool. The tool itself will handle guest/user differences.
        switch(currentPage) {
            case 'pricing':
                if (!user) {
                    setShowLoginModal(true);
                    return <GeneratorTool auth={auth} user={user} db={db} userData={userData} navigate={setCurrentPage} guestGenerations={guestGenerations} setGuestGenerations={setGuestGenerations} setShowLoginModal={setShowLoginModal} />;
                }
                return <PricingPage user={user} navigate={setCurrentPage} />;
            case 'manage-subscription':
                return <ManageSubscriptionPage user={user} navigate={setCurrentPage} />;
            default:
                return <GeneratorTool auth={auth} user={user} db={db} userData={userData} navigate={setCurrentPage} guestGenerations={guestGenerations} setGuestGenerations={setGuestGenerations} setShowLoginModal={setShowLoginModal} />;
        }
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white font-sans relative overflow-x-hidden">
            {showOnboarding && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowOnboarding(false)}>
                    <div className="bg-slate-800/90 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative text-center" onClick={e => e.stopPropagation()}>
                        <button className="absolute top-2 right-2 text-slate-400 hover:text-white" onClick={() => setShowOnboarding(false)}><X /></button>
                        <h2 className="text-2xl font-bold mb-2">Welcome to Shop Trend Genius!</h2>
                        <ul className="text-left text-slate-300 mb-4 space-y-2 pl-4">
                            <li>• Get <b>{DAILY_FREE_LIMIT} free ideas</b> per day as a guest.</li>
                            <li>• <b>Sign up</b> to save favorites and get more daily ideas.</li>
                            <li>• Go <b>Genius</b> for unlimited ideas & premium categories.</li>
                        </ul>
                        <div className="text-xs text-slate-400 mb-4">We are not affiliated with TikTok. TikTok is a trademark of ByteDance Ltd.</div>
                        <button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg hover:scale-105 transition-all" onClick={() => setShowOnboarding(false)}>Get Started</button>
                    </div>
                </div>
            )}
            {showLoginModal && (
                 <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowLoginModal(false)}>
                    <div className="bg-slate-800/90 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <LoginPage auth={auth} navigate={() => { setShowLoginModal(false); setCurrentPage('generator'); }} onClose={() => setShowLoginModal(false)} />
                    </div>
                </div>
            )}

            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/20 rounded-full filter blur-3xl opacity-50"></div>
            <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] bg-pink-500/20 rounded-full filter blur-3xl opacity-50"></div>
            
            <div className="relative z-10 p-4 sm:p-6 lg:p-8 w-full max-w-6xl mx-auto">
                {renderPage()}
                
                <footer className="text-center mt-12 text-slate-500 text-sm">
                    <p>Powered by AI. Designed for creators.</p>
                     <div className="text-xs text-slate-400 mt-2">We are not affiliated with TikTok. TikTok is a trademark of ByteDance Ltd.</div>
                    {user && <p className="mt-1 text-xs truncate">User ID: {user.uid}</p>}
                </footer>
            </div>
            <Analytics />
        </div>
    );
};


// --- SCREENS AND MAJOR COMPONENTS ---

const ErrorScreen = ({ message }) => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-center p-8">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Application Error</h1>
        <p className="text-slate-400 mb-2">{message}</p>
        <p className="text-slate-500 text-sm">Please try refreshing the page. If the problem persists, check the browser console for more details.</p>
    </div>
);

const LoadingScreen = () => (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

const PricingPage = ({ user, navigate }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubscribe = async () => {
        if (!VITE_STRIPE_PUBLISHABLE_KEY || !VITE_STRIPE_PRICE_ID) {
            setError("Payments are not configured correctly. Please contact support.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const stripe = await loadStripe(VITE_STRIPE_PUBLISHABLE_KEY);
            const { error } = await stripe.redirectToCheckout({
                lineItems: [{ price: VITE_STRIPE_PRICE_ID, quantity: 1 }],
                mode: 'subscription',
                successUrl: `${window.location.origin}/?payment_success=true`,
                cancelUrl: `${window.location.origin}/`,
                customerEmail: user?.isAnonymous ? '' : user?.email,
                clientReferenceId: user?.uid
            });

            if (error) {
                setError(error.message); // Will show the specific error from Stripe
                setIsLoading(false);
            }
        } catch (err) {
            setError(err.message || "An unexpected error occurred. Please try again."); // Will catch other errors
            setIsLoading(false);
            console.error(err);
        }
    };
    
    return (
        <div className="flex flex-col items-center animate-fade-in">
             <header className="text-center mb-10 relative w-full">
                 <button onClick={() => navigate('generator')} className="absolute top-0 left-0 text-slate-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
                 <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">Choose Your Plan</h1>
                 <p className="text-slate-400 text-lg max-w-2xl mx-auto mt-2">Unlock your full creative potential.</p>
             </header>
             {error && <p className="text-red-400 text-center mb-4 break-words">Error: {error}</p>}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                 <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-xl">
                     <h2 className="text-2xl font-bold text-center">Starter</h2>
                     <p className="text-center text-slate-400 mb-6">Perfect for getting started</p>
                     <div className="text-center mb-8">
                         <span className="text-5xl font-extrabold">Free</span>
                     </div>
                     <ul className="space-y-4 mb-8">
                         <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-400 mr-3" /> {DAILY_FREE_LIMIT} Daily Generations</li>
                         <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-400 mr-3" /> Basic Idea Categories</li>
                     </ul>
                     <button disabled className="w-full text-center bg-slate-700 text-slate-400 font-bold py-3 px-6 rounded-lg cursor-not-allowed">Your Current Plan</button>
                 </div>
                 <div className="bg-slate-800/80 border-2 border-purple-500 rounded-2xl p-8 shadow-2xl shadow-purple-500/10 relative">
                     <div className="absolute top-0 right-8 -translate-y-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</div>
                     <h2 className="text-2xl font-bold text-center text-purple-400">Genius</h2>
                     <p className="text-center text-slate-400 mb-6">For creators ready to go viral</p>
                     <div className="text-center mb-8">
                         <span className="text-5xl font-extrabold">$7</span>
                         <span className="text-slate-400">/month</span>
                     </div>
                     <ul className="space-y-4 mb-8">
                         <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-400 mr-3" /> Unlimited Generations</li>
                         <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-400 mr-3" /> All Idea Categories</li>
                         <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-400 mr-3" /> **NEW** Viral Script Templates</li>
                         <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-400 mr-3" /> **NEW** Trending Audio Ideas</li>
                         <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-400 mr-3" /> Save Favorite Ideas</li>
                     </ul>
                     <button onClick={handleSubscribe} disabled={isLoading} className="w-full flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl hover:shadow-purple-500/20 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all duration-300">
                         {isLoading ? 'Processing...' : 'Upgrade to Genius'}
                     </button>
                 </div>
             </div>
        </div>
    );
};

const LoginPage = ({ auth, navigate, onClose }) => {
    // --- STATE ---
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);

    // --- MAILERLITE HELPER ---
    async function subscribeToMailerLite(email) {
        if (!VITE_MAILERLITE_API_KEY || !VITE_MAILERLITE_LIST_ID) return;
        try {
            const response = await fetch('https://connect.mailerlite.com/api/subscribers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${VITE_MAILERLITE_API_KEY}`
                },
                body: JSON.stringify({
                    email,
                    groups: [VITE_MAILERLITE_LIST_ID]
                })
            });
            if (!response.ok) {
                const error = await response.json();
                console.error('MailerLite error:', error);
            }
        } catch (err) {
            console.error('MailerLite request failed:', err);
        }
    }

    // --- FORM SUBMISSION ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
                // Subscribe to MailerLite after successful signup
                await subscribeToMailerLite(email);
            }
            if(onClose) onClose();
        } catch (err) {
            setError(err.message.replace('Firebase: ',''));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-800 p-8 rounded-xl shadow-lg w-full max-w-md relative">
            {onClose && <button onClick={onClose} className="absolute top-2 right-2 text-slate-400 hover:text-white p-2"><X size={20} /></button>}
            <h2 className="text-2xl font-bold mb-4 text-center">{isLogin ? 'Login' : 'Sign Up'}</h2>
            {error && <div className="text-red-400 mb-4 text-center text-sm p-3 bg-red-500/10 rounded-md">{error}</div>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email"
                    className="bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500/50 focus:outline-none transition-all"
                    required
                />
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password (min. 6 characters)"
                    className="bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500/50 focus:outline-none transition-all"
                    required
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:scale-105 disabled:opacity-50 transition-all"
                >
                    {loading ? (isLogin ? 'Logging in...' : 'Signing up...') : (isLogin ? 'Login' : 'Sign Up')}
                </button>
            </form>
            <div className="text-center mt-4">
                <button
                    className="text-purple-400 hover:text-purple-300 font-semibold text-sm"
                    onClick={() => setIsLogin(!isLogin)}
                >
                    {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
                </button>
            </div>
        </div>
    );
};

const GeneratorTool = ({ auth, user, db, userData, navigate, guestGenerations, setGuestGenerations, setShowLoginModal }) => {
    // --- STATE & CONSTANTS ---
    const [product, setProduct] = useState('');
    const [ideaType, setIdeaType] = useState('Hooks');
    const [generatedIdeas, setGeneratedIdeas] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [showFavorites, setShowFavorites] = useState(false);
    const [isManagingSub, setIsManagingSub] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);
    
    // --- OWNER OVERRIDE FOR SUBSCRIPTION ---
    const isOwner = user?.email === "thinkpink999333@gmail.com";

    // Use owner override for subscription
    const isSubscribed = isOwner || userData?.subscription?.status === 'active';
    
    let remainingGenerations;
    if (user) {
        remainingGenerations = isSubscribed ? "Unlimited" : DAILY_FREE_LIMIT - (userData?.generations?.count || 0);
    } else {
        remainingGenerations = DAILY_FREE_LIMIT - (guestGenerations.count || 0);
    }


    const ideaTypes = [
        { name: 'Hooks', icon: <Sparkles />, prompt: "short, scroll-stopping hooks (3-7 seconds long)", premium: false },
        { name: 'Video Ideas', icon: <Film />, prompt: "creative video concepts (problem/solution, unboxing)", premium: false },
        { name: 'Tips & Tricks', icon: <Lightbulb />, prompt: "monetization tips and tricks for affiliates", premium: false },
        { name: 'Viral Scripts', icon: <FileText />, prompt: "a 3-part viral video script template with placeholders", premium: true },
        { name: 'TikTok Shop Hashtag Pack', icon: <TrendingUp />, prompt: `a pack of 15-20 high-performing, relevant hashtags for a TikTok Shop post about the following product. The hashtags should be a mix of trending, niche, and general TikTok Shop/affiliate tags. Only include the hashtags (no explanations), separated by spaces, and do NOT include the # symbol in the output (the user will copy and paste them).`, premium: true },
        { name: 'Timed Script', icon: <FileText />, prompt: "a full TikTok video script for a Shop/Affiliate product, broken down by suggested timestamps and scene descriptions. For each scene, provide: (1) Timestamp (e.g. 0:00-0:03), (2) Scene description, (3) Script/dialogue. Format as an array of scenes, each with these fields. Make it engaging and optimized for TikTok virality.", premium: true },
        { name: 'B-roll Prompts', icon: <Film />, prompt: `Give me a grouped, themed list of creative B-roll shot ideas for a TikTok video about the following product. Use 4-5 themed sections (with emoji headers, e.g. "💎 Glow-Up Edition", "💅 That Girl", "🛍️ Buy It Energy", "💥 Bold", "🫶 Sentimental"). For each section, give 4-5 specific, trendy, and visually creative B-roll prompts as bullet points. Use Gen Z/creator energy, TikTok/Shop/UGC style, and include emojis and formatting. Make the ideas feel fresh, viral, and ready to copy-paste. Format as markdown or plain text with emoji headers and bullet points. Product:`, premium: true },
    ];

    const handleGenerateIdeas = async () => {
        if (!VITE_GEMINI_API_KEY) {
            setError("AI service is not configured. Please contact support.");
            return;
        }
        if (!isSubscribed && remainingGenerations <= 0) {
            if (!user) {
                setShowLoginModal(true);
            } else {
                setError("You've reached your daily free limit. Upgrade to Genius for unlimited generations.");
            }
            return;
        }
        if (!product.trim()) {
            setError('Please enter a product or niche first.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setGeneratedIdeas([]);

        const selectedIdea = ideaTypes.find(it => it.name === ideaType);
        
        const prompt = `You are an expert TikTok marketing strategist specializing in creating viral content for TikTok Shop affiliates. Generate 6 unique and engaging ${selectedIdea.prompt} for a TikTok video promoting a "${product}".`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: { "ideas": { type: "ARRAY", items: { type: "OBJECT", properties: { "idea": { "type": "STRING" } } } } }
                }
            }
        };

        const apiKey = VITE_GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.error?.message || `API error: ${response.status}`);
            }
            
            const responseData = await response.json();
            
            if (responseData.candidates?.[0]?.content?.parts?.[0]) {
                const jsonText = responseData.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonText);
                setGeneratedIdeas(parsedJson.ideas || []);
                if (!parsedJson.ideas || parsedJson.ideas.length === 0) setError("The AI couldn't generate ideas for this topic.");

                // Decrement count for logged-in free user OR guest
                if (!isSubscribed) {
                    if(user && db) {
                        const appId = VITE_APP_ID || 'default-app-id';
                        const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
                        const today = new Date().toISOString().split('T')[0];
                        const newCount = (userData.generations.lastReset === today) ? (userData.generations.count || 0) + 1 : 1;
                        await updateDoc(userDocRef, { 'generations.count': newCount, 'generations.lastReset': today });
                    } else if (!user) { // Guest user
                        const today = new Date().toISOString().split('T')[0];
                        const newCount = (guestGenerations.lastReset === today) ? (guestGenerations.count || 0) + 1 : 1;
                        const updatedGuestData = { count: newCount, lastReset: today };
                        setGuestGenerations(updatedGuestData);
                        localStorage.setItem('guestGenerations', JSON.stringify(updatedGuestData));
                    }
                }

            } else {
                if (responseData.candidates?.[0]?.finishReason === 'SAFETY') setError('Request blocked for safety reasons. Please try a different product.');
                else setError('Failed to generate ideas. The response was empty.');
            }
        } catch (e) {
            console.error(e);
            setError(`An error occurred: ${e.message}.`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleManageSubscription = async () => {
        setIsManagingSub(true);
        setError(null);
        try {
            const response = await fetch('/api/create-portal-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid }),
            });
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            window.location.href = data.url;
        } catch (err) {
            setError(`Could not manage subscription: ${err.message}`);
        } finally {
            setIsManagingSub(false);
        }
    };

    const handleSelectIdeaType = (type) => {
        if (type.premium && !user) {
            setShowLoginModal(true);
            return;
        }
        if (type.premium && !isSubscribed) {
            setError('This is a Genius feature. Upgrade to unlock.');
            return;
        }
        setError(null);
        setIdeaType(type.name);
    }
    
    const isFavorite = (ideaText) => userData?.favorites?.some(fav => fav.idea === ideaText);

    const handleToggleFavorite = async (idea) => {
        if (!user) {
            setShowLoginModal(true);
            return;
        }
        if (!isSubscribed) {
            setError("Upgrade to Genius to save your favorite ideas.");
            return;
        }
        if (!user || !db) return;

        const appId = VITE_APP_ID || 'default-app-id';
        const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
        
        try {
             if (isFavorite(idea.idea)) {
                const favToRemove = userData.favorites.find(fav => fav.idea === idea.idea);
                if(favToRemove) await updateDoc(userDocRef, { favorites: arrayRemove(favToRemove) });
             } else {
                 await updateDoc(userDocRef, { favorites: arrayUnion({ ...idea, savedAt: new Date().toISOString() }) });
             }
        } catch(error) {
            console.error("Error toggling favorite:", error);
            setError("Could not update your favorites list.");
        }
    };
    
    const handleCopy = (text, index) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(textArea);
    }
    
    const handleLogout = async () => {
        setLogoutLoading(true);
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            setLogoutLoading(false);
        }
    }

    return (
        <div className="animate-fade-in">
            <header className="text-center mb-10 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">Shop Trend Genius</h1>
                    <p className="text-slate-400 text-lg">
                        {user ? (isSubscribed ? `Welcome back, Genius!` : `Welcome, ${userData?.email || 'Creator'}!`) : "Welcome! Let's create something viral."}
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 flex items-center gap-4">
                    { !user ? (
                         <div className="text-right">
                            <p className="font-bold text-slate-300">Daily Generations Left: {remainingGenerations > 0 ? remainingGenerations : 0}</p>
                            <button onClick={() => setShowLoginModal(true)} className="text-purple-400 hover:text-purple-300 font-semibold">Login / Sign Up</button>
                         </div>
                    ) : !isSubscribed ? (
                         <div className="text-right">
                             <p className="font-bold text-slate-300">Daily Generations Left: {remainingGenerations > 0 ? remainingGenerations : 0}</p>
                             <button onClick={() => navigate('pricing')} className="text-purple-400 hover:text-purple-300 font-semibold">Upgrade to Genius ✨</button>
                         </div>
                    ) : (
                        <>
                            <button onClick={() => setShowFavorites(!showFavorites)} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
                                <Star className="w-5 h-5 text-yellow-400"/> Favorites ({userData?.favorites?.length || 0})
                            </button>
                        </>
                    )}
                    {user && (
                        <button
                            onClick={handleLogout}
                            disabled={logoutLoading}
                            className="ml-4 text-slate-400 hover:text-white border border-slate-700 px-3 py-2 rounded-lg disabled:opacity-50"
                        >
                            {logoutLoading ? '...' : 'Logout'}
                        </button>
                    )}
                </div>
            </header>

            {isSubscribed && showFavorites && (
                <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={() => setShowFavorites(false)}>
                    <div className="bg-slate-800/90 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">Your Favorites</h3>
                            <button onClick={() => setShowFavorites(false)} className="text-slate-400 hover:text-white"><X /></button>
                        </div>
                        <div className="overflow-y-auto flex-grow pr-2 p-4">
                            {userData?.favorites?.length > 0 ? [...userData.favorites].reverse().map((fav, index) => (
                                <div key={index} className="bg-slate-800 p-4 rounded-lg mb-3">
                                    <p className="text-slate-300">{fav.idea}</p>
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => handleToggleFavorite(fav)} className="text-slate-500 hover:text-red-500"><X className="w-4 h-4"/></button>
                                        <button onClick={() => handleCopy(fav.idea, `fav-${index}`)} className="text-slate-500 hover:text-white"><Copy className="w-4 h-4"/></button>
                                    </div>
                                </div>
                            )) : <p className="text-slate-500 text-center mt-8">You haven't saved any ideas yet.</p>}
                        </div>
                    </div>
                </div>
            )}

            <main className="bg-slate-800/50 p-6 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-lg">
                <div className="flex flex-col sm:flex-row gap-4 mb-5">
                    <input
                        type="text"
                        value={product}
                        onChange={(e) => setProduct(e.target.value)}
                        placeholder="E.g., 'portable blender', 'skincare serum'"
                        className="flex-grow bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500/50 focus:outline-none transition-all"
                    />
                     <button
                        onClick={handleGenerateIdeas}
                        disabled={isLoading || (!isSubscribed && remainingGenerations <= 0)}
                        className="flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl hover:shadow-purple-500/20 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all"
                    >
                        {isLoading ? (<svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : (<><Sparkles className="w-5 h-5 mr-2" /> Generate Ideas</>)}
                    </button>
                </div>
                
                <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                    {ideaTypes.map((type) => (
                        <button
                            key={type.name}
                            onClick={() => handleSelectIdeaType(type)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 border ${ ideaType === type.name ? 'bg-white/10 border-slate-600 text-white' : 'bg-transparent border-slate-700 text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}
                        >
                            {type.icon} {type.name}
                            {type.premium && !user ? <Lock className="w-3 h-3 text-yellow-400 ml-1"/> : type.premium && !isSubscribed && <Lock className="w-3 h-3 text-yellow-400 ml-1"/>}
                        </button>
                    ))}
                </div>
            </main>

            <div className="mt-10 min-h-[300px]">
                {error && (<div className="text-center bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-lg"><p>{error}</p></div>)}
                {generatedIdeas.length > 0 && (
                     <>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                         {generatedIdeas.map((item, index) => {
                             // Special rendering for TikTok Shop Hashtag Pack
                             if (ideaType === 'TikTok Shop Hashtag Pack') {
                                 // Split by space, add #, join with space
                                 const hashtags = item.idea.split(/\s+/).filter(Boolean);
                                 return (
                                     <div key={index} className="group bg-slate-800/50 border border-slate-700 p-5 rounded-xl shadow-lg flex flex-col justify-between transform hover:-translate-y-1 transition-all duration-300 hover:border-purple-500/50">
                                         <p className="text-slate-300 mb-4 flex-grow break-words">
                                             {hashtags.map((tag, i) => (
                                                 <span key={i} className="inline-block mr-2">#{tag}</span>
                                             ))}
                                         </p>
                                         <div className="flex justify-end items-center gap-2">
                                             <button onClick={() => handleToggleFavorite(item)} className={`transition-colors ${isSubscribed ? 'text-slate-500 hover:text-yellow-400' : 'text-slate-600 cursor-help'}`} title={isSubscribed ? 'Save to Favorites' : 'Upgrade to save ideas'}>
                                                 <Star className={`w-5 h-5 ${user && isFavorite(item.idea) ? 'fill-current text-yellow-400' : ''}`} />
                                             </button>
                                             <button onClick={() => handleCopy(item.idea, index)} className="self-end flex items-center bg-slate-700/50 text-slate-400 group-hover:bg-purple-500/20 group-hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-200">
                                                 <Copy className="w-3.5 h-3.5 mr-2" />
                                                 {copiedIndex === index ? 'Copied!' : 'Copy'}
                                             </button>
                                         </div>
                                     </div>
                                 );
                             }
                             // Special rendering for B-roll Prompts: preserve line breaks and formatting
                             if (ideaType === 'B-roll Prompts') {
                                 return (
                                     <div key={index} className="group bg-slate-800/50 border border-slate-700 p-5 rounded-xl shadow-lg flex flex-col justify-between transform hover:-translate-y-1 transition-all duration-300 hover:border-purple-500/50">
                                         <div className="text-slate-300 mb-4 flex-grow whitespace-pre-line" style={{fontFamily: 'inherit'}}>
                                             {item.idea}
                                         </div>
                                         <div className="flex justify-end items-center gap-2">
                                             <button onClick={() => handleToggleFavorite(item)} className={`transition-colors ${isSubscribed ? 'text-slate-500 hover:text-yellow-400' : 'text-slate-600 cursor-help'}`} title={isSubscribed ? 'Save to Favorites' : 'Upgrade to save ideas'}>
                                                 <Star className={`w-5 h-5 ${user && isFavorite(item.idea) ? 'fill-current text-yellow-400' : ''}`} />
                                             </button>
                                             <button onClick={() => handleCopy(item.idea, index)} className="self-end flex items-center bg-slate-700/50 text-slate-400 group-hover:bg-purple-500/20 group-hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-200">
                                                 <Copy className="w-3.5 h-3.5 mr-2" />
                                                 {copiedIndex === index ? 'Copied!' : 'Copy'}
                                             </button>
                                         </div>
                                     </div>
                                 );
                             }
                             // Default rendering for other idea types
                             return (
                                 <div key={index} className="group bg-slate-800/50 border border-slate-700 p-5 rounded-xl shadow-lg flex flex-col justify-between transform hover:-translate-y-1 transition-all duration-300 hover:border-purple-500/50">
                                     <p className="text-slate-300 mb-4 flex-grow">{item.idea}</p>
                                     <div className="flex justify-end items-center gap-2">
                                         <button onClick={() => handleToggleFavorite(item)} className={`transition-colors ${isSubscribed ? 'text-slate-500 hover:text-yellow-400' : 'text-slate-600 cursor-help'}`} title={isSubscribed ? 'Save to Favorites' : 'Upgrade to save ideas'}>
                                             <Star className={`w-5 h-5 ${user && isFavorite(item.idea) ? 'fill-current text-yellow-400' : ''}`} />
                                         </button>
                                         <button onClick={() => handleCopy(item.idea, index)} className="self-end flex items-center bg-slate-700/50 text-slate-400 group-hover:bg-purple-500/20 group-hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-200">
                                             <Copy className="w-3.5 h-3.5 mr-2" />
                                             {copiedIndex === index ? 'Copied!' : 'Copy'}
                                         </button>
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                     {/* Disclaimer for generated ideas */}
                     <div className="text-xs text-slate-400 mt-4 text-center">
                        <span>Disclaimer: These AI-generated ideas are for inspiration only and are not guaranteed to be 100% accurate or suitable for your specific needs.</span>
                     </div>
                     </>
                )}
            </div>
        </div>
    );
};

const ManageSubscriptionPage = ({ user, navigate }) => {
    const [error, setError] = useState(null);
    useEffect(() => {
        const goToPortal = async () => {
            try {
                const response = await fetch('/api/create-portal-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.uid }),
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                window.location.href = data.url;
            } catch (err) {
                setError(err.message || 'Could not open subscription portal.');
            }
        };
        goToPortal();
    }, [user]);
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <h2 className="text-2xl font-bold mb-4">Manage Subscription</h2>
            {error ? (
                <div className="text-red-400 bg-red-500/10 border border-red-500/30 p-4 rounded-lg">{error}</div>
            ) : (
                <div className="flex flex-col items-center">
                    <svg className="animate-spin h-8 w-8 text-purple-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="text-slate-400">Redirecting to subscription management...</p>
                </div>
            )}
            <button onClick={() => navigate('generator')} className="mt-6 text-purple-400 hover:text-white">Back to Generator</button>
        </div>
    );
};


export default App;
