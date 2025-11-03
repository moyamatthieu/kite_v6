/**
 * Script de vérification d'architecture
 * Ce fichier aide à identifier quelle architecture est chargée
 */

// Identifier l'architecture au chargement
(function identifyArchitecture() {
    const isNewArchitecture = window.location.pathname.includes('new-index.html');
    const color = isNewArchitecture ? '#00ff00' : '#ff9900';
    const emoji = isNewArchitecture ? '✅' : '⚠️';
    const archName = isNewArchitecture ? 'NOUVELLE ARCHITECTURE (Clean)' : 'ANCIENNE ARCHITECTURE (Legacy)';
    
    console.log(`%c${emoji} ${archName} ${emoji}`, `
        font-size: 24px;
        font-weight: bold;
        color: ${color};
        text-shadow: 0 0 10px ${color};
        padding: 10px;
        background: #000;
        border: 2px solid ${color};
    `);
    
    if (isNewArchitecture) {
        console.log('%c🏗️ Architecture:', 'font-weight: bold', 'Core/Domain/Application/Infrastructure');
        console.log('%c📐 Patterns:', 'font-weight: bold', 'DI, Observer, Strategy, Factory');
        console.log('%c⚡ Principles:', 'font-weight: bold', 'SOLID');
        console.log('%c📁 Entry Point:', 'font-weight: bold', '/src/newIndex.tsx → NewSimulation');
    } else {
        console.log('%c📁 Entry Point:', 'font-weight: bold', '/index.tsx → Simulation (legacy)');
        console.log('%cℹ️ Pour tester la nouvelle architecture, accédez à:', 'color: #00aaff');
        console.log('%c   👉 /new-index.html', 'color: #00ff00; font-weight: bold; font-size: 14px');
    }
    
    // Exposer info globalement
    (window as any).__ARCHITECTURE__ = {
        version: isNewArchitecture ? '2.0.0' : '1.0.0',
        type: isNewArchitecture ? 'clean' : 'legacy',
        entryPoint: isNewArchitecture ? 'newIndex.tsx' : 'index.tsx'
    };
})();
