import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    signInAnonymously,
    signInWithCustomToken,
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
const VITE_INITIAL_AUTH_TOKEN = import.meta.env.VITE_INITIAL_AUTH_TOKEN;
const VITE_APP_ID = import.meta.env.VITE_APP_ID;
const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const VITE_STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const VITE_STRIPE_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID;
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
    const [showLoginModal, setShowLoginModal] = useState(false); // NEW
    const [guestGenerations, setGuestGenerations] = useState({ count: 0, lastResetTimestamp: '' }); // NEW
    const [showOnboarding, setShowOnboarding] = useState(false); // Onboarding modal

    const navigate = useCallback((page) => setCurrentPage(page), []);

    // --- GUEST GENERATION TRACKING ---
    useEffect(() => {
        // Only for guests
        if (!user) {
            const stored = JSON.parse(localStorage.getItem('guestGenerations') || '{}');
            const now = Date.now();
            if (!stored.lastResetTimestamp) {
                // First time use
                const newState = { count: 0, lastResetTimestamp: now };
                setGuestGenerations(newState);
                localStorage.setItem('guestGenerations', JSON.stringify(newState));
            } else {
                // Check if 24 hours have passed since last reset
                if (now - stored.lastResetTimestamp >= 24 * 60 * 60 * 1000) {
                    const newState = { count: 0, lastResetTimestamp: now };
                    setGuestGenerations(newState);
                    localStorage.setItem('guestGenerations', JSON.stringify(newState));
                } else {
                    setGuestGenerations(stored);
                }
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

            const unsubscribeAuth = onAuthStateChanged(authInstance, async (currentUser) => {
                const initialToken = VITE_INITIAL_AUTH_TOKEN || (typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null);
                if (currentUser) {
                    setUser(currentUser);
                } else {
                    try {
                        if (initialToken) {
                            await signInWithCustomToken(authInstance, initialToken);
                        } 
                    } catch (authError) {
                        console.error("Authentication failed:", authError);
                        setFirebaseError("Could not connect to the authentication service.");
                    }
                }
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
                    } else {
                        const initialData = {
                            email: user.email || 'anonymous',
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


    // --- REMOVE FORCED LOGIN REDIRECT ---
    // (No longer force login for guests)

    // --- Show onboarding on first visit ---
    useEffect(() => {
        if (!localStorage.getItem('seenOnboarding')) {
            setShowOnboarding(true);
            localStorage.setItem('seenOnboarding', '1');
        }
    }, []);

    // --- RENDER LOGIC ---
    if (!isAuthReady || (user && !userData) ) {
        return <LoadingScreen />;
    }

    if (firebaseError) {
        return <ErrorScreen message={firebaseError} />
    }

    const isSubscribed = userData?.subscription?.status === 'active';
    // For guests, use localStorage for free limit
    const today = new Date().toISOString().split('T')[0];
    let remainingGenerations = DAILY_FREE_LIMIT;
    if (user) {
        if (!isSubscribed) {
            if (userData?.generations?.lastResetTimestamp) {
                const now = Date.now();
                const lastReset = userData.generations.lastResetTimestamp;
                if (now - lastReset >= 24 * 60 * 60 * 1000) {
                    remainingGenerations = DAILY_FREE_LIMIT;
                } else {
                    remainingGenerations = DAILY_FREE_LIMIT - (userData.generations.count || 0);
                }
            } else {
                remainingGenerations = DAILY_FREE_LIMIT;
            }
        } else {
            remainingGenerations = 'Unlimited';
        }
    } else {
        if (guestGenerations.lastResetTimestamp) {
            const now = Date.now();
            const lastReset = guestGenerations.lastResetTimestamp;
            if (now - lastReset >= 24 * 60 * 60 * 1000) {
                remainingGenerations = DAILY_FREE_LIMIT;
            } else {
                remainingGenerations = DAILY_FREE_LIMIT - (guestGenerations.count || 0);
            }
        } else {
            remainingGenerations = DAILY_FREE_LIMIT;
        }
    }

    // --- MAIN RENDER ---
    return (
        <div className="min-h-screen bg-slate-900 text-white font-sans relative overflow-x-hidden">
            {/* Onboarding Modal */}
            {showOnboarding && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setShowOnboarding(false)}>
                    <div className="bg-slate-800/90 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative text-center" onClick={e => e.stopPropagation()}>
                        <button className="absolute top-2 right-2 text-slate-400 hover:text-white" onClick={() => setShowOnboarding(false)}><X /></button>
                        <h2 className="text-2xl font-bold mb-2">Welcome to Shop Trend Genius!</h2>
                        <ul className="text-left text-slate-300 mb-4 space-y-2">
                            <li>• <b>{DAILY_FREE_LIMIT}</b> free ideas per day as a guest</li>
                            <li>• <b>Genius</b> unlocks unlimited ideas, premium categories, and favorites</li>
                            <li>• Try "Trending Audio" for TikTok Shop-safe music</li>
                            <li>• Save your favorite ideas (sign up required)</li>
                        </ul>
                        <div className="text-xs text-slate-400 mb-4">We are not affiliated with TikTok. TikTok is a trademark of ByteDance Ltd.</div>
                        <button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg hover:scale-105 transition-all" onClick={() => setShowOnboarding(false)}>Get Started</button>
                    </div>
                </div>
            )}
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/20 rounded-full filter blur-3xl opacity-50"></div>
            <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] bg-pink-500/20 rounded-full filter blur-3xl opacity-50"></div>
            <div className="relative z-10 p-4 sm:p-6 lg:p-8 w-full max-w-6xl mx-auto">
                {/* Persistent Upgrade CTA for free users */}
                {!user || (user && !isSubscribed) ? (
                    <button onClick={() => user ? navigate('pricing') : setShowLoginModal(true)} className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 px-6 rounded-full shadow-lg hover:scale-105 transition-all text-base sm:text-lg">
                        {user ? 'Upgrade to Genius ✨' : 'Sign Up for Genius ✨'}
                    </button>
                ) : null}
                {/* Show login modal if requested or if guest is out of free generations */}
                {showLoginModal && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowLoginModal(false)}>
                        <div className="bg-slate-800/90 p-8 rounded-xl shadow-2xl w-full max-w-md relative" onClick={e => e.stopPropagation()}>
                            <button className="absolute top-2 right-2 text-slate-400 hover:text-white" onClick={() => setShowLoginModal(false)}><X /></button>
                            <LoginPage auth={auth} setUser={setUser} navigate={() => { setShowLoginModal(false); setCurrentPage('generator'); }} />
                        </div>
                    </div>
                )}
                {/* Generator always visible, pass guest/paid/free info */}
                {currentPage === 'generator' && (
                    <GeneratorTool
                        user={user}
                        db={db}
                        userData={userData}
                        isSubscribed={isSubscribed}
                        navigate={setCurrentPage}
                        guestGenerations={guestGenerations}
                        setGuestGenerations={setGuestGenerations}
                        showLoginModal={showLoginModal}
                        setShowLoginModal={setShowLoginModal}
                        remainingGenerations={remainingGenerations}
                        auth={auth} // Pass auth to GeneratorTool
                    />
                )}
                {currentPage === 'pricing' && user && <PricingPage user={user} navigate={setCurrentPage} />}
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
    // Add a thank you state to show after purchase
    const [showThankYou, setShowThankYou] = useState(false);
    const [subscriptionActive, setSubscriptionActive] = useState(false);

    useEffect(() => {
        // Check if user has just upgraded (subscription active)
        if (user && user.reload) {
            user.reload().then(() => {
                // If user object has custom claims or metadata, check here
                // But since we don't have userData here, rely on location or props
                // We'll show thank you if redirected from payment_success
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('payment_success')) {
                    setShowThankYou(true);
                    // Remove param from URL
                    window.history.replaceState(null, '', window.location.pathname);
                }
            });
        } else {
            // Fallback: check URL param
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('payment_success')) {
                setShowThankYou(true);
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    }, [user]);

    const handleSubscribe = async () => {
        if (!VITE_STRIPE_PUBLISHABLE_KEY || !VITE_STRIPE_PRICE_ID) {
            setError("Payments are not configured correctly. Please contact support.");
            console.error("Stripe keys not found in environment variables.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const stripe = await loadStripe(VITE_STRIPE_PUBLISHABLE_KEY);
            const { error } = await stripe.redirectToCheckout({
                lineItems: [{ price: VITE_STRIPE_PRICE_ID, quantity: 1 }],
                mode: 'subscription',
                successUrl: `${window.location.origin}?payment_success=true`,
                cancelUrl: `${window.location.origin}?payment_canceled=true`,
                customerEmail: user?.isAnonymous ? '' : user?.email,
                clientReferenceId: user?.uid,
                automaticTax: { enabled: true },
            });

            if (error) {
                setError(error.message);
                setIsLoading(false);
            }
        } catch (err) {
            console.error(err); // <-- Added for debugging Stripe integration errors
            setError("An unexpected error occurred. Please try again.");
            setIsLoading(false);
        }
    };
    
    return (
        <div className="flex flex-col items-center animate-fade-in">
            {showThankYou && (
                <div className="w-full max-w-2xl mx-auto bg-green-600/10 border border-green-500/30 text-green-300 text-center p-4 rounded-lg mb-6">
                    <h2 className="text-2xl font-bold mb-1">Thank you for your purchase!</h2>
                    <p>Your Genius subscription is now active. Enjoy unlimited ideas and premium features!</p>
                </div>
            )}
            <header className="text-center mb-10 relative w-full">
                 <button onClick={() => navigate('generator')} className="absolute top-0 left-0 text-slate-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
                 <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">Choose Your Plan</h1>
                 <p className="text-slate-400 text-lg max-w-2xl mx-auto mt-2">Unlock your full creative potential.</p>
             </header>
             {error && <p className="text-red-400 text-center mb-4">{error}</p>}
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

const LoginPage = ({ auth, setUser, navigate, onClose }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isLogin) {
                const userCred = await signInWithEmailAndPassword(auth, email, password);
                setUser(userCred.user);
                navigate('generator');
            } else {
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                setUser(userCred.user);
                navigate('generator');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <div className="bg-slate-800/80 p-8 rounded-xl shadow-lg w-full max-w-md relative">
                {onClose && (
                    <button onClick={onClose} className="absolute top-2 right-2 text-slate-400 hover:text-white"><X /></button>
                )}
                <h2 className="text-2xl font-bold mb-4 text-center">{isLogin ? 'Login' : 'Sign Up'}</h2>
                {error && <div className="text-red-400 mb-2 text-center">{error}</div>}
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
                        placeholder="Password"
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
                        className="text-purple-400 hover:text-purple-300 font-semibold"
                        onClick={() => setIsLogin(!isLogin)}
                    >
                        {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- GeneratorTool ---
const GeneratorTool = ({ user, db, userData, isSubscribed, navigate, guestGenerations, setGuestGenerations, showLoginModal, setShowLoginModal, remainingGenerations, auth }) => {
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

    const ideaTypes = [
        { name: 'Hooks', icon: <Sparkles />, prompt: "short, scroll-stopping hooks (3-7 seconds long)", premium: false },
        { name: 'Video Ideas', icon: <Film />, prompt: "creative video concepts (problem/solution, unboxing)", premium: false },
        { name: 'Tips & Tricks', icon: <Lightbulb />, prompt: "monetization tips and tricks for affiliates", premium: false },
        { name: 'Viral Scripts', icon: <FileText />, prompt: "a 3-part viral video script template with placeholders", premium: true },
        {
            name: 'Trending Audio',
            icon: <Music />,
            prompt: `3 trending TikTok audios that are available in the TikTok Commercial Music Library (CML) and can be used for TikTok Shop/affiliate videos. For each, provide:\n- Song title\n- Artist\n- A short reason why it fits this product\n- (If possible) a TikTok link or identifier.\nOnly suggest audios that are marked as 'Commercially Licensed' and available for TikTok Shop videos. Do NOT suggest mainstream or non-commercially licensed music.`,
            premium: true
        },
    ];
    
    // --- MODIFIED GENERATION LOGIC FOR GUESTS ---
    const handleGenerateIdeas = async () => {
        if (!VITE_GEMINI_API_KEY) {
            setError("AI service is not configured. Please contact support.");
            return;
        }
        if (!isSubscribed && remainingGenerations <= 0) {
            if (!user) {
                setShowLoginModal(true); // Show login/signup modal for guests
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
                if (!isSubscribed && user && db) {
                    const appId = VITE_APP_ID || 'default-app-id';
                    const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
                    const newCount = (userData?.generations?.lastReset === today) ? (userData.generations.count || 0) + 1 : 1;
                    await updateDoc(userDocRef, { generations: { count: newCount, lastReset: today } });
                } else if (!isSubscribed && !user) {
                    // Guest: update localStorage
                    const today = new Date().toISOString().split('T')[0];
                    let newCount = guestGenerations.lastReset === today ? (guestGenerations.count || 0) + 1 : 1;
                    const updated = { count: newCount, lastReset: today };
                    setGuestGenerations(updated);
                    localStorage.setItem('guestGenerations', JSON.stringify(updated));
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

    const handleSelectIdeaType = (type) => {
        if (type.premium && !isSubscribed) {
            setError('This is a Genius feature. Upgrade to unlock.');
            return;
        }
        setError(null);
        setIdeaType(type.name);
    }
    
    const isFavorite = (ideaText) => userData?.favorites?.some(fav => fav.idea === ideaText);

    const handleToggleFavorite = async (idea) => {
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

    // --- Format Trending Audio Results ---
    const renderIdea = (item, index) => {
        if (ideaType === 'Trending Audio') {
            // Try to parse as JSON object with fields
            try {
                const parsed = JSON.parse(item.idea);
                return (
                    <div className="bg-slate-800/60 border border-purple-700 p-4 rounded-xl flex flex-col gap-1">
                        <div className="font-bold text-lg text-purple-300">{parsed.title || parsed.song || 'Audio'}</div>
                        <div className="text-slate-400 text-sm">{parsed.artist && <>by {parsed.artist}</>}</div>
                        {parsed.reason && <div className="italic text-slate-400 text-xs">{parsed.reason}</div>}
                        {parsed.link && <a href={parsed.link} target="_blank" rel="noopener noreferrer" className="text-purple-400 underline text-xs mt-1">Listen on TikTok</a>}
                    </div>
                );
            } catch {
                // fallback to plain text
                return <p className="text-slate-300">{item.idea}</p>;
            }
        }
        return <p className="text-slate-300 mb-4 flex-grow">{item.idea}</p>;
    };

    return (
        <div className="animate-fade-in">
            {/* Guest-to-user upgrade modal when out of free generations, only if login modal is not open */}
            {!user && !showLoginModal && guestGenerations.lastResetTimestamp === new Date().toISOString().split('T')[0] && guestGenerations.count >= DAILY_FREE_LIMIT && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setShowLoginModal(true)}>
                    <div className="bg-slate-800/90 p-8 rounded-2xl shadow-2xl w-full max-w-md relative text-center" onClick={e => e.stopPropagation()}>
                        <button className="absolute top-2 right-2 text-slate-400 hover:text-white" onClick={() => setShowLoginModal(false)}><X /></button>
                        <h2 className="text-2xl font-bold mb-2">Unlock More Ideas!</h2>
                        <p className="mb-4 text-slate-300">Sign up for a free account to get more daily ideas, save your favorites, and access premium features.</p>
                        <button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg hover:scale-105 transition-all" onClick={() => setShowLoginModal(true)}>Sign Up / Login</button>
                    </div>
                </div>
            )}
            <header className="text-center mb-10 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">Shop Trend Genius</h1>
                    <p className="text-slate-400 text-lg">
                        {isSubscribed ? "Welcome, Genius Member!" : "Welcome! Let's create something viral."}
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 flex items-center gap-4">
                    {!user ? (
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
                            <button onClick={handleManageSubscription} disabled={isManagingSub} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50">
                                <Settings className="w-5 h-5 text-slate-400"/> {isManagingSub ? 'Loading...' : 'Manage Subscription'}
                            </button>
                            <button onClick={() => setShowFavorites(!showFavorites)} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
                                <Star className="w-5 h-5 text-yellow-400"/> My Favorites ({userData?.favorites?.length || 0})
                            </button>
                        </>
                    )}
                    {/* Logout button for all logged-in users */}
                    {user && (
                        <button
                            onClick={async () => {
                                setLogoutLoading(true);
                                try {
                                    await signOut(auth);
                                    setLogoutLoading(false);
                                    window.location.reload(); // Force reload to clear state and re-init auth
                                } catch (e) {
                                    setLogoutLoading(false);
                                    alert('Logout failed. Please try again.');
                                }
                            }}
                            disabled={logoutLoading}
                            className="ml-4 text-slate-400 hover:text-white border border-slate-700 px-3 py-2 rounded-lg disabled:opacity-50"
                        >
                            {logoutLoading ? 'Logging out...' : 'Logout'}
                        </button>
                    )}
                </div>
            </header>

            {isSubscribed && showFavorites && 
                 <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowFavorites(false)}>
                     <div className="absolute top-0 right-0 h-full w-full max-w-md bg-slate-900 shadow-2xl p-6 flex flex-col animate-slide-in-right" onClick={e => e.stopPropagation()}>
                         <div className="flex justify-between items-center mb-4">
                             <h2 className="text-2xl font-bold">My Favorites</h2>
                             <button onClick={() => setShowFavorites(false)} className="text-slate-400 hover:text-white"><X/></button>
                         </div>
                         <div className="overflow-y-auto flex-grow pr-2">
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
            }

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
                            {type.premium && !isSubscribed && <Lock className="w-3 h-3 text-yellow-400 ml-1"/>}
                        </button>
                    ))}
                </div>
            </main>
            <div className="mt-10 min-h-[300px]">
                {error && (<div className="text-center bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-lg"><p>{error}</p></div>)}
                {generatedIdeas.length > 0 && (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                         {generatedIdeas.map((item, index) => (
                             <div key={index} className="group bg-slate-800/50 border border-slate-700 p-5 rounded-xl shadow-lg flex flex-col justify-between transform hover:-translate-y-1 transition-all duration-300 hover:border-purple-500/50">
                                 {renderIdea(item, index)}
                                 <div className="flex justify-end items-center gap-2 mt-2">
                                     <button onClick={() => handleToggleFavorite(item)} className={`transition-colors ${isSubscribed ? 'text-slate-500 hover:text-yellow-400' : 'text-slate-600 cursor-help'}`} title={isSubscribed ? 'Save to Favorites' : 'Upgrade to save ideas'}>
                                         <Star className={`w-5 h-5 ${isFavorite(item.idea) ? 'fill-current text-yellow-400' : ''}`} />
                                     </button>
                                     <button onClick={() => handleCopy(item.idea, index)} className="self-end flex items-center bg-slate-700/50 text-slate-400 group-hover:bg-purple-500/20 group-hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-200">
                                         <Copy className="w-3.5 h-3.5 mr-2" />
                                         {copiedIndex === index ? 'Copied!' : 'Copy'}
                                     </button>
                                 </div>
                             </div>
                         ))}
                     </div>
                )}
                {/* Guest favorites prompt */}
                {!user && generatedIdeas.length > 0 && (
                    <div className="text-center text-xs text-slate-400 mt-4">Sign up to save your favorite ideas!</div>
                )}
            </div>
        </div>
    );
};


export default App;
