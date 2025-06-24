import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { Sparkles, Copy, Lightbulb, TrendingUp, Film, CheckCircle, Heart, MessageCircle, Lock, Star, Music, FileText, X } from 'lucide-react';

// --- FIREBASE CONFIG (Provided by the environment) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const DAILY_FREE_LIMIT = 3;

// --- MAIN APP COMPONENT ---
const App = () => {
    // --- STATE MANAGEMENT ---
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null); // Will hold subscription status, favorites, etc.
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [currentPage, setCurrentPage] = useState('generator'); // 'generator' or 'pricing'

    // --- FIREBASE INITIALIZATION ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
                if (currentUser) {
                    setUser(currentUser);
                } else if (typeof __initial_auth_token !== 'undefined') {
                    await signInWithCustomToken(authInstance, __initial_auth_token);
                } else {
                    await signInAnonymously(authInstance);
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization error:", error);
            setIsAuthReady(true); 
        }
    }, []);

    // --- FETCH USER DATA (SUB, FAVORITES, USAGE) ---
    const fetchUserData = useCallback(async () => {
        if (isAuthReady && user && db) {
            const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                setUserData(userDoc.data());
            } else {
                // Create a new user document if one doesn't exist
                const initialData = {
                    email: user.email || 'anonymous',
                    createdAt: serverTimestamp(),
                    generations: { count: 0, lastReset: new Date().toISOString().split('T')[0] },
                    favorites: [],
                    subscription: { status: 'free' }
                };
                await setDoc(userDocRef, initialData);
                setUserData(initialData);
            }
        }
    }, [isAuthReady, user, db]);
    
    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);
    
    // --- RENDER LOGIC ---
    if (!isAuthReady || !userData) {
        return <LoadingScreen />;
    }
    
    const isSubscribed = userData.subscription?.status === 'active';
    const navigate = (page) => setCurrentPage(page);

    return (
        <div className="min-h-screen bg-slate-900 text-white font-sans relative overflow-hidden">
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/20 rounded-full filter blur-3xl opacity-50"></div>
            <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] bg-pink-500/20 rounded-full filter blur-3xl opacity-50"></div>
            
            <div className="relative z-10 p-4 sm:p-6 lg:p-8 w-full max-w-6xl mx-auto">
                {currentPage === 'generator' && <GeneratorTool user={user} db={db} userData={userData} fetchUserData={fetchUserData} isSubscribed={isSubscribed} navigate={navigate} />}
                {currentPage === 'pricing' && <PricingPage user={user} db={db} navigate={navigate} fetchUserData={fetchUserData} />}

                <footer className="text-center mt-12 text-slate-500 text-sm">
                    <p>Powered by AI. Designed for creators.</p>
                    {user && <p className="mt-1 text-xs truncate">User ID: {user.uid}</p>}
                </footer>
            </div>
        </div>
    );
};


// --- SCREENS AND MAJOR COMPONENTS ---

const LoadingScreen = () => (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

const PricingPage = ({ user, db, navigate, fetchUserData }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubscribe = async () => {
        if (!user || !db) return;
        setIsLoading(true);
        try {
            const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
            const newSubscription = {
                plan: 'Genius',
                status: 'active',
                subscribedAt: serverTimestamp(),
            };
            await updateDoc(userDocRef, { subscription: newSubscription });
            await fetchUserData(); // Re-fetch user data to update UI
            navigate('generator'); // Go back to the tool after subscribing
        } catch (error) {
            console.error("Subscription failed:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="flex flex-col items-center animate-fade-in">
             <header className="text-center mb-10 relative w-full">
                <button onClick={() => navigate('generator')} className="absolute top-0 left-0 text-slate-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
                <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">Choose Your Plan</h1>
                <p className="text-slate-400 text-lg max-w-2xl mx-auto mt-2">Unlock your full creative potential.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                {/* Free Plan Card */}
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
                {/* Genius Plan Card */}
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

const GeneratorTool = ({ user, db, userData, fetchUserData, isSubscribed, navigate }) => {
    // --- STATE & CONSTANTS ---
    const [product, setProduct] = useState('');
    const [ideaType, setIdeaType] = useState('Hooks');
    const [generatedIdeas, setGeneratedIdeas] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [showFavorites, setShowFavorites] = useState(false);

    const ideaTypes = [
        { name: 'Hooks', icon: <Sparkles />, prompt: "short, scroll-stopping hooks (3-7 seconds long)", premium: false },
        { name: 'Video Ideas', icon: <Film />, prompt: "creative video concepts (problem/solution, unboxing)", premium: false },
        { name: 'Tips & Tricks', icon: <Lightbulb />, prompt: "monetization tips and tricks for affiliates", premium: false },
        { name: 'Viral Scripts', icon: <FileText />, prompt: "a 3-part viral video script template with placeholders", premium: true },
        { name: 'Trending Audio', icon: <Music />, prompt: "3 trending TikTok audio ideas that would fit this product", premium: true },
    ];
    
    // --- USAGE & GENERATION LOGIC ---
    const today = new Date().toISOString().split('T')[0];
    const generations = userData.generations;
    let remainingGenerations = DAILY_FREE_LIMIT;

    if (!isSubscribed) {
        if (generations?.lastReset === today) {
            remainingGenerations = DAILY_FREE_LIMIT - generations.count;
        }
    } else {
        remainingGenerations = "Unlimited";
    }

    const handleGenerateIdeas = async () => {
        // ... (API call logic remains the same, but with usage tracking)
        if (!isSubscribed && remainingGenerations <= 0) {
            setError("You've reached your daily free limit. Upgrade to Genius for unlimited generations.");
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

        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData?.error?.message || `API error: ${response.status}`);
            
            if (responseData.candidates?.[0]?.content?.parts?.[0]) {
                const jsonText = responseData.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonText);
                setGeneratedIdeas(parsedJson.ideas || []);
                if (!parsedJson.ideas || parsedJson.ideas.length === 0) setError("The AI couldn't generate ideas.");

                // Update usage count for free users
                if (!isSubscribed) {
                    const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
                    const newCount = (generations?.lastReset === today) ? generations.count + 1 : 1;
                    await updateDoc(userDocRef, { generations: { count: newCount, lastReset: today } });
                    fetchUserData(); // Refresh data
                }

            } else {
                if (responseData.candidates?.[0]?.finishReason === 'SAFETY') setError('Request blocked for safety reasons.');
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
    
    // --- FAVORITES LOGIC ---
    const isFavorite = (ideaText) => userData.favorites?.some(fav => fav.idea === ideaText);

    const handleToggleFavorite = async (idea) => {
        if (!isSubscribed) {
            setError("Upgrade to Genius to save your favorite ideas.");
            return;
        }
        const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
        if (isFavorite(idea.idea)) {
            await updateDoc(userDocRef, { favorites: arrayRemove(idea) });
        } else {
            await updateDoc(userDocRef, { favorites: arrayUnion(idea) });
        }
        fetchUserData(); // Refresh user data
    };

    // --- RENDER ---
    return (
        <div className="animate-fade-in">
            <header className="text-center mb-10 flex flex-col sm:flex-row justify-between items-center">
                 <div>
                    <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">TikTok Shop Genius</h1>
                    <p className="text-slate-400 text-lg">
                        {isSubscribed ? "Welcome, Genius Member!" : "Welcome! Let's create something viral."}
                    </p>
                </div>
                 <div className="mt-4 sm:mt-0">
                    {!isSubscribed ? (
                         <div className="text-right">
                             <p className="font-bold text-slate-300">Daily Generations Left: {remainingGenerations > 0 ? remainingGenerations : 0}</p>
                             <button onClick={() => navigate('pricing')} className="text-purple-400 hover:text-purple-300 font-semibold">Upgrade to Genius ✨</button>
                         </div>
                    ) : (
                         <button onClick={() => setShowFavorites(!showFavorites)} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
                            <Star className="w-5 h-5 text-yellow-400"/> My Favorites ({userData.favorites?.length || 0})
                         </button>
                    )}
                </div>
            </header>

            {/* Favorites Drawer */}
            {isSubscribed && showFavorites && 
                <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowFavorites(false)}>
                    <div className="absolute top-0 right-0 h-full w-full max-w-md bg-slate-900 shadow-2xl p-6 flex flex-col animate-slide-in-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">My Favorites</h2>
                            <button onClick={() => setShowFavorites(false)} className="text-slate-400 hover:text-white"><X/></button>
                        </div>
                        <div className="overflow-y-auto flex-grow pr-2">
                           {userData.favorites?.length > 0 ? userData.favorites.map((fav, index) => (
                               <div key={index} className="bg-slate-800 p-4 rounded-lg mb-3">
                                   <p className="text-slate-300">{fav.idea}</p>
                                   <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => handleToggleFavorite(fav)} className="text-slate-500 hover:text-red-500"><X className="w-4 h-4"/></button>
                                        <button onClick={() => {
                                            const textArea = document.createElement('textarea');
                                            textArea.value = fav.idea;
                                            document.body.appendChild(textArea);
                                            textArea.select();
                                            document.execCommand('copy');
                                            document.body.removeChild(textArea);
                                        }} className="text-slate-500 hover:text-white"><Copy className="w-4 h-4"/></button>
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
                        className="flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl hover:shadow-purple-500/20 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all"
                    >
                        {isLoading ? (<>...</>) : (<><Sparkles className="w-5 h-5 mr-2" /> Generate Ideas</>)}
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

            <div className="mt-10">
                {error && (<div className="text-center bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-lg"><p>{error}</p></div>)}
                {generatedIdeas.length > 0 && (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {generatedIdeas.map((item, index) => (
                            <div key={index} className="group bg-slate-800/50 border border-slate-700 p-5 rounded-xl shadow-lg flex flex-col justify-between transform hover:-translate-y-1 transition-all duration-300 hover:border-purple-500/50">
                                <p className="text-slate-300 mb-4 flex-grow">{item.idea}</p>
                                <div className="flex justify-end items-center gap-2">
                                     <button onClick={() => handleToggleFavorite(item)} className={`transition-colors ${isSubscribed ? 'text-slate-500 hover:text-yellow-400' : 'text-slate-600 cursor-help'}`} title={isSubscribed ? 'Save to Favorites' : 'Upgrade to save ideas'}>
                                        <Star className={`w-5 h-5 ${isFavorite(item.idea) ? 'fill-current text-yellow-400' : ''}`} />
                                     </button>
                                     <button onClick={() => {
                                        const textArea = document.createElement('textarea');
                                        textArea.value = item.idea;
                                        document.body.appendChild(textArea);
                                        textArea.select();
                                        document.execCommand('copy');
                                        document.body.removeChild(textArea);
                                        setCopiedIndex(index);
                                        setTimeout(() => setCopiedIndex(null), 2000);
                                     }} className="self-end flex items-center bg-slate-700/50 text-slate-400 group-hover:bg-purple-500/20 group-hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-200">
                                        <Copy className="w-3.5 h-3.5 mr-2" />
                                        {copiedIndex === index ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


export default App;
