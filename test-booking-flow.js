/**
 * Test del flujo completo de reservas
 * Ejecutar: node test-booking-flow.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const AvailabilityTemplate = require('./models/AvailabilityTemplate');
const TimeSlot = require('./models/TimeSlot');
const Booking = require('./models/Booking');
const AvailabilityService = require('./services/AvailabilityService');
const BookingService = require('./services/BookingService');

async function testBookingFlow() {
    try {
        console.log('🔗 Conectando a MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado\n');

        // 1. Buscar un profesor existente
        console.log('👤 Buscando profesor...');
        const teacher = await User.findOne({ role: 'teacher' });
        if (!teacher) {
            console.log('❌ No hay profesores en la base de datos');
            return;
        }
        console.log(`   ✅ Profesor: ${teacher.name} (${teacher._id})\n`);

        // 2. Buscar un cliente con clases disponibles
        console.log('👨‍👩‍👧 Buscando cliente con clases...');
        const client = await User.findOne({ 
            role: 'client',
            $or: [
                { classesRemaining: { $gt: 0 } },
                { 'welcomeKitData.totalClasses': { $gt: 0 } }
            ]
        });
        if (!client) {
            console.log('❌ No hay clientes con clases disponibles');
            console.log('   Creando cliente de prueba...');
            // Crear cliente temporal
        }
        console.log(`   ✅ Cliente: ${client?.name || 'N/A'}`);
        console.log(`   Clases disponibles: ${client?.classesRemaining || client?.welcomeKitData?.totalClasses || 0}\n`);

        // 3. Verificar o crear plantilla de disponibilidad
        console.log('📅 Verificando plantilla de disponibilidad...');
        let template = await AvailabilityTemplate.findOne({ teacherId: teacher._id });
        
        if (!template) {
            console.log('   Creando plantilla de ejemplo...');
            template = await AvailabilityTemplate.create({
                teacherId: teacher._id,
                name: 'Horario Test',
                timezone: 'America/Santiago',
                bufferMinutes: 10,
                defaultDuration: 45,
                weeklySlots: [
                    { dayOfWeek: 1, startTime: '10:00', endTime: '18:00', maxStudents: 1 },
                    { dayOfWeek: 3, startTime: '10:00', endTime: '18:00', maxStudents: 1 },
                    { dayOfWeek: 5, startTime: '10:00', endTime: '14:00', maxStudents: 1 }
                ],
                isActive: true
            });
            console.log('   ✅ Plantilla creada');
        } else {
            console.log(`   ✅ Plantilla existente: ${template.name}`);
            console.log(`   Días activos: ${template.weeklySlots.map(s => ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][s.dayOfWeek]).join(', ')}`);
        }
        console.log();

        // 4. Generar slots para próximos 7 días
        console.log('⚡ Generando slots de tiempo...');
        const fromDate = new Date();
        const toDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        const generatedSlots = await AvailabilityService.generateSlotsFromTemplate(
            template._id.toString(),
            fromDate,
            toDate
        );
        console.log(`   ✅ ${generatedSlots.length} slots generados\n`);

        // 5. Verificar slots disponibles
        console.log('🕐 Verificando slots disponibles...');
        const availableSlots = await TimeSlot.find({
            teacherId: teacher._id,
            status: 'available',
            startTime: { $gte: new Date() }
        }).sort({ startTime: 1 }).limit(5);

        console.log(`   Encontrados: ${availableSlots.length} slots\n`);
        
        if (availableSlots.length > 0) {
            console.log('   Próximos horarios disponibles:');
            availableSlots.forEach((slot, i) => {
                const date = new Date(slot.startTime);
                console.log(`   ${i + 1}. ${date.toLocaleDateString('es-CL', { 
                    weekday: 'short', 
                    day: '2-digit', 
                    month: 'short' 
                })} ${date.toLocaleTimeString('es-CL', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                })} (${slot._id})`);
            });
        }
        console.log();

        // 6. Intentar hacer una reserva (solo si hay cliente con clases)
        if (client && availableSlots.length > 0) {
            const slotToBook = availableSlots[0];
            
            console.log('📝 Intentando reservar el primer slot...');
            console.log(`   Slot: ${new Date(slotToBook.startTime).toLocaleString('es-CL')}`);
            console.log(`   Cliente: ${client.name}`);
            
            try {
                const booking = await BookingService.bookSlot(
                    slotToBook._id.toString(),
                    client._id.toString(), // studentId
                    client._id.toString(), // clientId (el que paga)
                    'America/Santiago'
                );
                
                console.log('   ✅ ¡Reserva exitosa!');
                console.log(`   ID Reserva: ${booking._id}`);
                console.log(`   Sesión MIDI: ${booking.midiSession?.sessionCode || 'N/A'}`);
                
                // Verificar que se descontó la clase
                const updatedClient = await User.findById(client._id);
                console.log(`   Clases restantes: ${updatedClient.classesRemaining}\n`);
                
            } catch (error) {
                console.log(`   ⚠️ Error en reserva: ${error.message}`);
                if (error.message === 'INSUFFICIENT_CLASSES') {
                    console.log('   → El cliente no tiene clases suficientes');
                }
            }
        }

        // 7. Mostrar estadísticas finales
        console.log('\n📊 RESUMEN DEL SISTEMA:');
        console.log('─'.repeat(40));
        
        const totalTemplates = await AvailabilityTemplate.countDocuments();
        const totalSlots = await TimeSlot.countDocuments();
        const availableCount = await TimeSlot.countDocuments({ status: 'available' });
        const bookedCount = await TimeSlot.countDocuments({ status: 'booked' });
        const totalBookings = await Booking.countDocuments();
        
        console.log(`   Plantillas de disponibilidad: ${totalTemplates}`);
        console.log(`   Slots totales: ${totalSlots}`);
        console.log(`   - Disponibles: ${availableCount}`);
        console.log(`   - Reservados: ${bookedCount}`);
        console.log(`   Reservas totales: ${totalBookings}`);
        console.log('─'.repeat(40));

        console.log('\n✅ Test completado exitosamente');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

testBookingFlow();
