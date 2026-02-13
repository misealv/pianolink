// @ts-check
const { test: base, expect } = require('@playwright/test');
const { MongoClient, ObjectId } = require('mongodb');

/**
 * Fixtures personalizados para PianoLink
 * 
 * Provee:
 * - db: Conexión a MongoDB para validaciones
 * - testUsers: Usuarios únicos por test
 * - cleanupAfterTest: Limpieza automática
 */

// Generador de emails únicos para evitar colisiones
const generateUniqueEmail = (prefix) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@pianolink.test`;
};

// Generador de teléfonos únicos
const generateUniquePhone = () => {
  const random = Math.floor(Math.random() * 90000000) + 10000000;
  return `+569${random}`;
};

// Clase para validaciones de base de datos
class DBValidator {
  constructor(uri) {
    this.uri = uri || process.env.MONGODB_URI;
    this.client = null;
    this.db = null;
  }

  async connect() {
    if (!this.uri) {
      console.warn('⚠️ MONGODB_URI no configurado, validaciones BD deshabilitadas');
      return false;
    }
    try {
      this.client = await MongoClient.connect(this.uri);
      this.db = this.client.db('pianolink');
      return true;
    } catch (error) {
      console.warn('⚠️ No se pudo conectar a MongoDB:', error.message);
      return false;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  // Verificar que un documento existe
  async assertExists(collection, query, message = '') {
    if (!this.db) return; // Skip si no hay conexión
    const doc = await this.db.collection(collection).findOne(query);
    if (!doc) {
      throw new Error(`DB Assertion Failed: ${message || `Documento no encontrado en ${collection}`}`);
    }
    return doc;
  }

  // Verificar que un documento NO existe
  async assertNotExists(collection, query, message = '') {
    if (!this.db) return;
    const doc = await this.db.collection(collection).findOne(query);
    if (doc) {
      throw new Error(`DB Assertion Failed: ${message || `Documento no debería existir en ${collection}`}`);
    }
  }

  // Verificar conteo de documentos
  async assertCount(collection, query, expectedCount, message = '') {
    if (!this.db) return;
    const count = await this.db.collection(collection).countDocuments(query);
    if (count !== expectedCount) {
      throw new Error(
        `DB Assertion Failed: ${message || `${collection} count ${count} !== ${expectedCount}`}`
      );
    }
  }

  // Verificar campo específico
  async assertField(collection, query, field, expectedValue, message = '') {
    if (!this.db) return;
    const doc = await this.db.collection(collection).findOne(query);
    if (!doc) {
      throw new Error(`Documento no encontrado para verificar campo ${field}`);
    }
    
    const actualValue = this.getNestedField(doc, field);
    if (actualValue !== expectedValue) {
      throw new Error(
        `DB Assertion Failed: ${message || `${field}: ${actualValue} !== ${expectedValue}`}`
      );
    }
    return doc;
  }

  // Obtener campo anidado (ej: "teacherData.subscriptionStatus")
  getNestedField(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Obtener documento directamente
  async findOne(collection, query) {
    if (!this.db) return null;
    return await this.db.collection(collection).findOne(query);
  }

  // Limpiar documentos de prueba
  async cleanup(collection, query) {
    if (!this.db) return;
    await this.db.collection(collection).deleteMany(query);
  }
}

// Datos de usuarios de prueba
const createTestUserData = () => ({
  teacher: {
    email: generateUniqueEmail('teacher'),
    password: 'TestPassword123!',
    name: 'Profesor Test',
    phone: generateUniquePhone(),
    role: 'teacher',
  },
  student: {
    email: generateUniqueEmail('student'),
    password: 'TestPassword123!',
    name: 'Estudiante Test',
    phone: generateUniquePhone(),
    role: 'student',
  },
  admin: {
    email: 'admin@pianolink.net',
    password: process.env.ADMIN_PASSWORD || 'AdminTest123!',
    role: 'admin',
  },
});

// Extend base test con fixtures personalizados
const test = base.extend({
  // Fixture: Conexión a base de datos
  db: async ({}, use) => {
    const db = new DBValidator();
    await db.connect();
    await use(db);
    await db.close();
  },

  // Fixture: Usuarios de prueba únicos por test
  testUsers: async ({}, use) => {
    const users = createTestUserData();
    await use(users);
  },

  // Fixture: Página autenticada como profesor
  teacherPage: async ({ page, testUsers }, use) => {
    // Registrar profesor
    await page.goto('/register.html');
    await page.fill('#name', testUsers.teacher.name);
    await page.fill('#email', testUsers.teacher.email);
    await page.fill('#password', testUsers.teacher.password);
    
    // Seleccionar rol profesor si existe el selector
    const roleSelector = page.locator('#role, [name="role"]');
    if (await roleSelector.isVisible()) {
      await roleSelector.selectOption('teacher');
    }
    
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**');
    
    await use(page);
  },

  // Fixture: Página autenticada como estudiante
  studentPage: async ({ page, testUsers }, use) => {
    await page.goto('/register.html');
    await page.fill('#name', testUsers.student.name);
    await page.fill('#email', testUsers.student.email);
    await page.fill('#password', testUsers.student.password);
    
    const roleSelector = page.locator('#role, [name="role"]');
    if (await roleSelector.isVisible()) {
      await roleSelector.selectOption('student');
    }
    
    await page.click('button[type="submit"]');
    await page.waitForURL('**/cliente**');
    
    await use(page);
  },
});

// Constantes de precios en centavos (evitar floats)
const PRICES = {
  // Kit de bienvenida: $44 USD = 4400 centavos
  WELCOME_KIT_USD_CENTS: 4400,
  
  // Membresía mensual profesor: ~$20 USD = 2000 centavos
  TEACHER_MEMBERSHIP_USD_CENTS: 2000,
  
  // Membresía en CLP: ~$19,000 CLP = 1900000 centavos
  TEACHER_MEMBERSHIP_CLP_CENTS: 1900000,
  
  // Comisión plataforma: 20%
  PLATFORM_FEE_PERCENT: 20,
  
  // Pago a profesor: 80%
  TEACHER_CUT_PERCENT: 80,
};

// Helper para calcular comisiones (siempre en centavos)
const calculateCommission = (priceInCents) => ({
  platformFee: Math.floor(priceInCents * PRICES.PLATFORM_FEE_PERCENT / 100),
  teacherCut: Math.floor(priceInCents * PRICES.TEACHER_CUT_PERCENT / 100),
  total: priceInCents,
});

module.exports = {
  test,
  expect,
  DBValidator,
  generateUniqueEmail,
  generateUniquePhone,
  PRICES,
  calculateCommission,
};
