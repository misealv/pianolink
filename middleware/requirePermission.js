/**
 * middleware/requirePermission.js
 * Middleware genérico de permisos por feature flag - PianoLink v5.0 (Fase 3)
 * 
 * Verifica que el profesor tenga un permiso específico habilitado
 * en teacherData.permissions. Los permisos se sincronizan desde el plan
 * vía PlanPermissionService y nunca se editan manualmente.
 * 
 * Uso:
 *   router.post('/invite/generate', protect, teacherOrAdmin, requirePermission('canInvitePrivateStudents'), handler);
 */

/**
 * Genera un middleware que verifica un permiso específico del profesor
 * @param {string} permissionKey - Clave del permiso en teacherData.permissions
 *   Valores válidos: 'canInvitePrivateStudents', 'hasPriorityQueue'
 * @returns {Function} Express middleware
 */
const requirePermission = (permissionKey) => {
    return (req, res, next) => {
        const user = req.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'No autorizado'
            });
        }

        // Admins siempre tienen acceso completo
        if (user.role === 'admin') {
            return next();
        }

        // Solo profesores tienen permisos de plan
        if (user.role !== 'teacher') {
            return res.status(403).json({
                success: false,
                message: 'Acceso denegado. Solo profesores pueden realizar esta acción.'
            });
        }

        // Verificar que teacherData y permissions existan
        const permissions = user.teacherData?.permissions;
        if (!permissions) {
            return res.status(403).json({
                success: false,
                message: 'Permisos no configurados. Contacta soporte.',
                upgradeRequired: true,
                currentPlan: user.teacherData?.plan || 'free'
            });
        }

        // Verificar el permiso específico
        if (!permissions[permissionKey]) {
            const plan = user.teacherData?.plan || 'free';

            // Mensajes descriptivos según el permiso denegado
            const messages = {
                canInvitePrivateStudents: 'Para invitar alumnos particulares necesitas un plan Premium o Founder. Con un plan de pago, tus alumnos privados no generan comisión para PianoLink.',
                hasPriorityQueue: 'La asignación prioritaria de alumnos está disponible en planes Premium y Founder.'
            };

            return res.status(403).json({
                success: false,
                message: messages[permissionKey] || `Permiso "${permissionKey}" no habilitado en tu plan actual.`,
                upgradeRequired: true,
                currentPlan: plan,
                requiredPlans: ['premium', 'founder']
            });
        }

        // Verificar que la membresía esté activa (no expirada)
        const status = user.teacherData?.subscriptionStatus;
        if (user.teacherData?.plan !== 'free' && status !== 'active' && status !== 'trial') {
            return res.status(403).json({
                success: false,
                message: 'Tu membresía ha expirado. Renueva tu plan para continuar usando esta función.',
                renewalRequired: true,
                currentPlan: user.teacherData?.plan,
                subscriptionStatus: status
            });
        }

        next();
    };
};

module.exports = requirePermission;
