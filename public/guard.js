/* public/guard.js */

(function securityGuard() {
    // 1. Ocultamos todo preventivamente
    document.documentElement.style.display = 'none';

    const params = new URLSearchParams(window.location.search);
    
    // CASO A: Es Alumno (Trae invitación o sala) -> PASA
    if (params.get('role') === 'student' || params.get('sala')) {
        document.documentElement.style.display = ''; // Mostramos la página
        return; 
    }

    // CASO B: Es Profesor (Tiene sesión guardada) -> PASA
    const session = localStorage.getItem('pianoUser');
    if (session) {
        try {
            const user = JSON.parse(session);
            if (user && user.role === 'teacher') {
                document.documentElement.style.display = ''; // Mostramos la página
                return; 
            }
        } catch (e) {}
    }

    // CASO C: Intruso -> FUERA
    console.warn("⛔ Acceso denegado. Redirigiendo...");
    window.location.href = 'login.html';
})();