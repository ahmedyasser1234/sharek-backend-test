const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const session = require('express-session');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const fileUpload = require('express-fileupload');
const UAParser = require('ua-parser-js');
const app = express();

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(fileUpload());

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.send('❌ يجب تسجيل الدخول أولاً');
  }
  next();
}


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/employee/upload/:type/:id', requireAuth, async (req, res) => {
  const accessToken = req.session.accessToken;
  const employeeId = req.params.id;
  const type = req.params.type;

  if (!req.files || !req.files.file) {
    return res.send('❌ لا يوجد ملف مرفوع');
  }

  const file = req.files.file;
  const tempPath = path.join(tempDir, file.name);

  try {
    await file.mv(tempPath);

    const form = new FormData();
    form.append(type, fs.createReadStream(tempPath), {
      filename: file.name,
      contentType: file.mimetype
    });

    await axios.post(`http://localhost:3000/employee/upload/${type}/${employeeId}`, form, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...form.getHeaders()
      }
    });

    fs.unlinkSync(tempPath);
    res.redirect('/usage');
  } catch (error) {
    console.error('❌ خطأ في رفع الصورة:', error.response?.data || error.message);
    res.send('❌ فشل رفع الصورة');
  }
});

// ✅ تسجيل الدخول
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login-company', async (req, res) => {
  const { email, password } = req.body;

  console.log('🔹 محاولة تسجيل الدخول:', email);

  try {
    // تسجيل الدخول من backend
    const response = await axios.post('http://localhost:3000/company/login', { email, password });

    const accessToken = response.data.accessToken || response.data.data?.accessToken;
    const refreshToken = response.data.refreshToken || response.data.data?.refreshToken;

    if (!accessToken) {
      console.error('❌ لم يتم استرجاع accessToken');
      return res.send('❌ فشل تسجيل الدخول (Access token missing)');
    }

    req.session.accessToken = accessToken;
    req.session.refreshToken = refreshToken;

    // جلب بيانات الشركة
    const profileRes = await axios.get('http://localhost:3000/company/profile', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const company = profileRes.data.data;
    console.log('🔹 بيانات الشركة:', company);

    if (!company?.id) {
      console.error('❌ لم يتم استرجاع companyId');
      return res.send('❌ فشل في استرجاع بيانات الشركة');
    }

    req.session.companyId = company.id;

    // جلب بيانات الاشتراك
    const subRes = await axios.get(`http://localhost:3000/company/${company.id}/subscription`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    console.log('🔹 Subscription Response:', JSON.stringify(subRes.data, null, 2));

    // التحقق من الاشتراك بشكل آمن
    const subscriptionData = subRes.data.data || subRes.data;
    const hasSubscription = subscriptionData && (
      subscriptionData.plan || subscriptionData.planId || subscriptionData.id
    );

    if (hasSubscription) {
      console.log('✅ الشركة لديها اشتراك، التوجيه لصفحة الاستخدام');
      return res.redirect('/usage');
    } else {
      console.log('⚠️ لا يوجد اشتراك، التوجيه لصفحة الخطط');
      return res.redirect('/plans');
    }

  } catch (error) {
    console.error('❌ خطأ في تسجيل الدخول:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    res.send('❌ فشل تسجيل الدخول (تحقق من console)');
  }
});






// ✅ تسجيل شركة جديدة
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register-company', async (req, res) => {
  const { name, email, password, phone, logoUrl, description } = req.body;

  try {
    const response = await axios.post('http://localhost:3000/company', {
      name, email, password, phone, logoUrl, description,
      isActive: true, role: 'company'
    });

    const company = response.data;
    res.send(`✅ تم تسجيل الشركة بنجاح. ID: ${company.id}`);
  } catch (error) {
    console.error('❌ خطأ في التسجيل:', error.response?.data || error.message);
    res.send('❌ فشل التسجيل');
  }
});

// ✅ عرض الخطط
// ✅ عرض الخطط (مصحح)
app.get('/plans', async (req, res) => {
  if (!req.session.companyId) {
    console.error('❌ لا يوجد companyId في الجلسة');
    return res.send('❌ يجب تسجيل الدخول أولًا');
  }

  const companyId = req.session.companyId;

  try {
    const response = await axios.get('http://localhost:3000/plans');

    // ✅ تأكد أن plans Array
    let plans = [];
    if (Array.isArray(response.data)) {
      plans = response.data;
    } else if (Array.isArray(response.data.data)) {
      plans = response.data.data;
    } else if (Array.isArray(response.data.plans)) {
      plans = response.data.plans;
    } else {
      console.warn('⚠️ لم يتم العثور على الخطط كـ Array:', response.data);
    }

    console.log('🔹 plans:', plans);

    res.render('plans', { plans, companyId });
  } catch (error) {
    console.error('❌ خطأ في تحميل الخطط:', error.response?.data || error.message);
    console.log('📦 session:', req.session);

    res.send('❌ فشل تحميل الخطط');
  }
});


// ✅ الاشتراك في خطة
app.post('/subscribe', async (req, res) => {
  const { planId } = req.body;
  const companyId = req.session.companyId;
  const accessToken = req.session.accessToken;

  try {
    const response = await axios.post(`http://localhost:3000/company/${companyId}/subscribe/${planId}`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const result = response.data;
    if (result.redirectToDashboard) return res.redirect('/usage');
    res.send(result.message);
  } catch (error) {
    console.error('❌ خطأ في الاشتراك:', error.response?.data || error.message);
    res.send('❌ فشل الاشتراك في الخطة');
  }
});

// ✅ عرض بيانات الاستخدام
// ✅ عرض بيانات الاستخدام (مصحح)
app.get('/usage', requireAuth, async (req, res) => {
  const companyId = req.session.companyId;
  const accessToken = req.session.accessToken;

  try {
    console.log(`🔐 الشركة: ${companyId} | بدء تحميل بيانات الاستخدام`);

    // جلب بيانات الاشتراك
    const subRes = await axios.get(`http://localhost:3000/company/${companyId}/subscription`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const currentSubscription = subRes.data.data || subRes.data.subscription || subRes.data;
    const hasSubscription = !!(currentSubscription?.plan || currentSubscription?.planId || currentSubscription?.id);
    const isExpired = currentSubscription?.endDate
      ? new Date(currentSubscription.endDate).getTime() < Date.now()
      : false;

    console.log(`📦 الاشتراك الحالي:`, currentSubscription);

    // جلب بيانات الشركة
    const companyRes = await axios.get(`http://localhost:3000/company/${companyId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const company = companyRes.data.data || companyRes.data;

    // جلب بيانات الموظفين
    const empRes = await axios.get(`http://localhost:3000/employee`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const employeeList = empRes.data.data || empRes.data;

    console.log(`👥 عدد الموظفين المحملين: ${employeeList.length}`);

    const employees = Array.isArray(employeeList)
      ? await Promise.all(employeeList.map(async emp => {
          let visitsCount = 0;
          try {
            const vRes = await axios.get(`http://localhost:3000/visits/count/${emp.id}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });

            console.log(`📊 رد عدد زيارات الموظف ${emp.id}:`, vRes.data);

            visitsCount = vRes.data?.data?.visits ?? 0;

          } catch (err) {
            console.warn(`⚠️ فشل جلب زيارات للموظف ${emp.id}:`, err.response?.data || err.message);
          }

          return {
            id: emp.id,
            name: emp.name,
            email: emp.email,
            jobTitle: emp.jobTitle,
            phone: emp.phone,
            whatsapp: emp.whatsapp,
            location: emp.location,
            cardUrl: emp.cardUrl,
            qrCode: emp.qrCode || null,
            profileImageUrl: emp.profileImageUrl || null,
            secondaryImageUrl: emp.secondaryImageUrl || null,
            facebookImageUrl: emp.facebookImageUrl || null,
            instagramImageUrl: emp.instagramImageUrl || null,
            tiktokImageUrl: emp.tiktokImageUrl || null,
            snapchatImageUrl: emp.snapchatImageUrl || null,
            visits: visitsCount
          };
        }))
      : [];

    console.log(`📋 جدول عدد الزيارات لكل موظف:`);
    employees.forEach(emp => {
      console.log(`🔸 ${emp.name} (${emp.id}) → ${emp.visits} زيارة`);
    });

    // جلب كل الزيارات المرتبطة بالشركة
    let visits = [];
    let totalVisitsCount = 0;
    try {
      const visitsRes = await axios.get(`http://localhost:3000/visits`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      visits = Array.isArray(visitsRes.data.data)
        ? visitsRes.data.data
        : Array.isArray(visitsRes.data)
          ? visitsRes.data
          : [];

      totalVisitsCount = visits.length;
      console.log(`📈 عدد الزيارات الإجمالي: ${totalVisitsCount}`);
    } catch (err) {
      console.warn('⚠️ فشل جلب قائمة الزيارات:', err.response?.data || err.message);
    }

    // إرسال البيانات للـ EJS
    res.render('usage', {
      usage: {
        company,
        currentSubscription,
        hasSubscription,
        isExpired,
        employees,
        visits,
        totalVisitsCount
      }
    });

  } catch (error) {
    console.error('❌ خطأ في تحميل بيانات الاشتراك أو الموظفين:', error.response?.data || error.message);
    res.send('❌ فشل تحميل بيانات الاشتراك أو الموظفين');
  }
});

// رفع شيت الاكسل لاضافه الموظفين 
app.post('/import-employees', requireAuth, async (req, res) => {
  const accessToken = req.session.accessToken;
  const file = req.files?.excelFile;

  if (!file) return res.send('❌ لم يتم رفع ملف Excel');

  const tempPath = path.join(tempDir, file.name);
  await file.mv(tempPath);

  const form = new FormData();
  form.append('file', fs.createReadStream(tempPath), {
    filename: file.name,
    contentType: file.mimetype
  });

  try {
    await axios.post('http://localhost:3000/employee/import/excel', form, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...form.getHeaders()
      }
    });

    fs.unlinkSync(tempPath);
    res.redirect('/usage');
  } catch (error) {
    console.error('❌ خطأ في استيراد الموظفين:', error.response?.data || error.message);
    res.send('❌ فشل استيراد الموظفين');
  }
});

// تنزيل شيت الاكسل لموظفين الموجودين فى الداتا بيز 
app.get('/export-employees', requireAuth, async (req, res) => {
  const accessToken = req.session.accessToken;

  try {
    const response = await axios.get('http://localhost:3000/employee/export/excel', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      responseType: 'arraybuffer'
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=employees.xlsx');
    res.send(response.data);
  } catch (error) {
    console.error('❌ خطأ في تصدير الموظفين:', error.response?.data || error.message);
    res.send('❌ فشل تصدير الموظفين');
  }
});

// ✅ إضافة موظف جديد
app.post('/add-employee', requireAuth, async (req, res) => {
  const accessToken = req.session.accessToken;
  if (!req.files) return res.send('❌ لم يتم رفع أي صور');

  const form = new FormData();

  const fields = [
    'name', 'email', 'conemail', 'emailTitle', 'jobTitle',
    'phone', 'conphone', 'phoneTitle', 'whatsapp', 'wechat', 'telephone',
    'location', 'locationTitle', 'conStreet', 'conAdressLine', 'conCity',
    'conState', 'conCountry', 'conZipcode', 'conDirection', 'conGoogleMapUrl',
    'smsNumber', 'faxNumber', 'aboutTitle', 'about', 'socialTitle', 'socialDescription',
    'facebook', 'instagram', 'tiktok', 'snapchat', 'customImageTitle', 'customImageDescription',
    'testimonialTitle', 'testimonialDescription', 'testimonialText', 'testimonialName', 'testimonialDesignation',
    'workingHoursTitle', 'pdfGalleryTitle', 'pdfGalleryDescription',
    'pdfTitle', 'pdfSubtitle', 'videoTitle', 'videoDescription',
    'buttonBlockTitle', 'buttonBlockDescription', 'buttonLabel', 'buttonLink',
    'contactFormName', 'contactFormTitle', 'contactFormDescription',
    'contactFieldLabel', 'contactFieldErrorMessage',
    'feedbackTitle', 'feedbackDescription', 'lowestRatingLabel', 'highestRatingLabel',
    'highRatingHeading', 'highRatingDescription', 'highRatingCTA', 'highRatingRedirectUrl',
    'workLink', 'productsLink', 'designId', 'cardUrl', 'qrCode'
  ];

  // ✅ دعم الـ Arrays و Objects
  fields.forEach(field => {
    if (req.body[field] !== undefined) {
      const value = req.body[field];
      if (Array.isArray(value)) {
        value.forEach(v => form.append(field, v.toString()));
      } else if (typeof value === 'object') {
        form.append(field, JSON.stringify(value));
      } else {
        form.append(field, value.toString());
      }
    }
  });

  const booleanFields = [
    'preventMultipleFormViews',
    'contactFieldRequired', 'showRatingLabels', 'collectFeedbackOnLowRating',
    'enableAutoRedirect'
  ];
  booleanFields.forEach(field => {
    if (req.body[field] !== undefined) {
      form.append(field, req.body[field] === 'true' ? 'true' : 'false');
    }
  });

  const numberFields = ['feedbackMaxRating', 'autoRedirectAfterSeconds'];
  numberFields.forEach(field => {
    if (req.body[field] !== undefined) {
      form.append(field, req.body[field]);
    }
  });

  const enums = {
    videoType: ['youtube', 'vimeo'],
    contactFormDisplayType: ['overlay', 'inline'],
    contactFieldType: ['email', 'phone', 'one-line', 'multi-line'],
    feedbackIconType: ['star', 'heart', 'thumb', 'smile']
  };

  Object.entries(enums).forEach(([key, allowed]) => {
    const value = req.body[key];
    if (value && allowed.includes(value)) {
      form.append(key, value);
    }
  });

// ✅ منطق ساعات العمل
if (req.body.showWorkingHours === 'true') {
  form.append('showWorkingHours', 'true'); // لازم تبقى string

  if (req.body.isOpen24Hours === 'true') {
    form.append('isOpen24Hours', 'true');
  } else {
    form.append('isOpen24Hours', 'false');

    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const workingHours = {};

    days.forEach(day => {
      const from = req.body[`workingHours[${day}][from]`];
      const to = req.body[`workingHours[${day}][to]`];
      if (from && to) {
        workingHours[day] = { from, to };
      }
    });

    if (Object.keys(workingHours).length > 0) {
      // ابعته كـ JSON string
      form.append('workingHours', JSON.stringify(workingHours));
    }
  }
} else {
  form.append('showWorkingHours', 'false'); // string
  form.append('isOpen24Hours', 'false');   // string
}

  // ✅ الصور
  const imageFields = {
    profileImage: 'profileImageUrl',
    secondaryImage: 'secondaryImageUrl',
    facebookImage: 'facebookImageUrl',
    instagramImage: 'instagramImageUrl',
    tiktokImage: 'tiktokImageUrl',
    snapchatImage: 'snapchatImageUrl',
    customImage: 'customImageUrl',
    testimonialImage: 'testimonialImageUrl',
    workingHoursImage: 'workingHoursImageUrl',
    pdfFile: 'pdfFileUrl',
    pdfThumbnail: 'pdfThumbnailUrl',
    contactFormHeaderImage: 'contactFormHeaderImageUrl'
  };

  for (const [uploadField, entityField] of Object.entries(imageFields)) {
    const file = req.files?.[uploadField];
    if (file) {
      const tempPath = path.join(tempDir, file.name);
      await file.mv(tempPath);
      form.append(entityField, fs.createReadStream(tempPath), {
        filename: file.name,
        contentType: file.mimetype
      });
    }
  }

  try {
    await axios.post('http://localhost:3000/employee', form, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...form.getHeaders()
      }
    });

    Object.values(req.files).forEach(file => {
      const tempPath = path.join(tempDir, file.name);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });

    res.redirect('/usage');
  } catch (error) {
    console.error('❌ خطأ في إضافة الموظف:', error.response?.data || error.message);
    res.send('❌ فشل إضافة الموظف');
  }
});

// ✅ تعديل بيانات موظف
app.post('/update-employee', requireAuth, async (req, res) => {
  const accessToken = req.session.accessToken;
  const { id, ...rest } = req.body;

  // ✅ منطق ساعات العمل في التحديث
  const updateData = { ...rest };

  if (req.body.showWorkingHours === 'true') {
    if (req.body.isOpen24Hours === 'true') {
      updateData.showWorkingHours = true;
      updateData.isOpen24Hours = true;
      updateData.workingHours = null;
    } else {
      updateData.showWorkingHours = true;
      updateData.isOpen24Hours = false;

      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const workingHours = {};

      days.forEach(day => {
        const from = req.body[`workingHours[${day}][from]`];
        const to = req.body[`workingHours[${day}][to]`];
        if (from && to) {
          workingHours[day] = { from, to };
        }
      });

      if (Object.keys(workingHours).length > 0) {
        updateData.workingHours = workingHours;
      }
    }
  } else {
    updateData.showWorkingHours = false;
    updateData.isOpen24Hours = false;
    updateData.workingHours = null;
  }

  try {
    await axios.put(`http://localhost:3000/employee/${id}`, updateData, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    res.redirect('/usage');
  } catch (error) {
    console.error('❌ خطأ في تعديل الموظف:', error.response?.data || error.message);
    res.send('❌ فشل تعديل الموظف');
  }
});

// ✅ حذف موظف
app.post('/delete-employee', requireAuth, async (req, res) => {
  const accessToken = req.session.accessToken;
  const { id } = req.body;

  try {
    await axios.delete(`http://localhost:3000/employee/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    res.redirect('/usage');
  } catch (error) {
    console.error('❌ خطأ في حذف الموظف:', error.message);
    res.send('❌ فشل حذف الموظف');
  }
});

// 📌 دالة تنسيق بيانات الموظف
function formatEmployee(employee) {
  return {
    ...employee,

    // ✅ العناوين النصية
    emailTitle: employee.emailTitle || null,
    phoneTitle: employee.phoneTitle || null,
    locationTitle: employee.locationTitle || null,
    aboutTitle: employee.aboutTitle || null,
    socialTitle: employee.socialTitle || null,
    testimonialTitle: employee.testimonialTitle || null,
    testimonialName: employee.testimonialName || null,
    testimonialDesignation: employee.testimonialDesignation || null,
    workingHoursTitle: employee.workingHoursTitle || null,
    pdfGalleryTitle: employee.pdfGalleryTitle || null,
    pdfTitle: employee.pdfTitle || null,
    pdfSubtitle: employee.pdfSubtitle || null,
    videoTitle: employee.videoTitle || null,
    buttonBlockTitle: employee.buttonBlockTitle || null,
    contactFormTitle: employee.contactFormTitle || null,
    feedbackTitle: employee.feedbackTitle || null,
    highRatingHeading: employee.highRatingHeading || null,

    // ✅ الصور
    profileImageUrl: employee.profileImageUrl || null,
    secondaryImageUrl: employee.secondaryImageUrl || null,
    facebookImageUrl: employee.facebookImageUrl || null,
    instagramImageUrl: employee.instagramImageUrl || null,
    tiktokImageUrl: employee.tiktokImageUrl || null,
    snapchatImageUrl: employee.snapchatImageUrl || null,
    customImageUrl: employee.customImageUrl || null,
    testimonialImageUrl: employee.testimonialImageUrl || null,
    workingHoursImageUrl: employee.workingHoursImageUrl || null,
    pdfFileUrl: employee.pdfFileUrl || null,
    pdfThumbnailUrl: employee.pdfThumbnailUrl || null,
    contactFormHeaderImageUrl: employee.contactFormHeaderImageUrl || null,

    // ✅ روابط التواصل
    facebook: employee.facebook || null,
    instagram: employee.instagram || null,
    tiktok: employee.tiktok || null,
    snapchat: employee.snapchat || null,
    whatsapp: employee.whatsapp || null,
    wechat: employee.wechat || null,
    phone: employee.phone || null,
    email: employee.email || null,

    // ✅ روابط العمل
    workLink: employee.workLink || null,
    productsLink: employee.productsLink || null,
    cardUrl: employee.cardUrl || null,
    qrCode: employee.qrCode || null,

    // ✅ الجاليري
    images: employee.images || [],

    // ✅ بيانات الشركة
    company: employee.company || null,

    // ✅ بيانات إضافية
    testimonialText: employee.testimonialText || null,
    testimonialDescription: employee.testimonialDescription || null,
    customImageTitle: employee.customImageTitle || null,
    customImageDescription: employee.customImageDescription || null,
    videoDescription: employee.videoDescription || null,
    buttonBlockDescription: employee.buttonBlockDescription || null,
    buttonLabel: employee.buttonLabel || null,
    buttonLink: employee.buttonLink || null,
    contactFormDescription: employee.contactFormDescription || null,
    contactFieldLabel: employee.contactFieldLabel || null,
    contactFieldErrorMessage: employee.contactFieldErrorMessage || null,
    feedbackDescription: employee.feedbackDescription || null,
    lowestRatingLabel: employee.lowestRatingLabel || null,
    highestRatingLabel: employee.highestRatingLabel || null,
    highRatingDescription: employee.highRatingDescription || null,
    highRatingCTA: employee.highRatingCTA || null,
    highRatingRedirectUrl: employee.highRatingRedirectUrl || null,
    videoUrl: employee.videoUrl || null,
    contactFormName: employee.contactFormName || null,

    // ✅ أنواع مقيدة
    videoType: employee.videoType || null,
    contactFormDisplayType: employee.contactFormDisplayType || null,
    contactFieldType: employee.contactFieldType || null,
    feedbackIconType: employee.feedbackIconType || null,

    // ✅ منطقية ورقمية
    isOpen24Hours: employee.isOpen24Hours || false,
    preventMultipleFormViews: employee.preventMultipleFormViews || false,
    contactFieldRequired: employee.contactFieldRequired || false,
    showRatingLabels: employee.showRatingLabels || false,
    collectFeedbackOnLowRating: employee.collectFeedbackOnLowRating || false,
    enableAutoRedirect: employee.enableAutoRedirect || false,
    feedbackMaxRating: employee.feedbackMaxRating || 5,
    autoRedirectAfterSeconds: employee.autoRedirectAfterSeconds || 0,

    // ✅ جدول المواعيد
    workingHours: employee.workingHours || null
  };
}

// ✅ عرض البطاقة مع التصميم

app.get('/:designId/:uniqueUrl', async (req, res) => {
  const { designId, uniqueUrl } = req.params;

  try {
    // ✅ سحب بيانات الموظف من الـ backend بدون تسجيل زيارة داخلي
    const response = await axios.get(`http://localhost:3000/employee/by-url/${uniqueUrl}`);
    const employee = response.data.data;

    if (!employee) {
      return res.status(404).send("❌ الموظف غير موجود");
    }

    // ✅ تحديد التصميم
    const template = designId || employee.designId || 'classic';
    console.log(`🎨 عرض البطاقة باستخدام التصميم: ${template}`);

    // ✅ تحليل الـ User-Agent
    const parser = new UAParser(req.headers['user-agent']);
    const uaResult = parser.getResult();

    const visitData = {
      employeeId: employee.id,
      source: req.query.source === 'qr' ? 'qr' : 'link',
      os: uaResult.os.name || 'unknown',
      browser: uaResult.browser.name || 'unknown',
      deviceType: uaResult.device.type || 'desktop',
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    };

    // ✅ تسجيل الزيارة في الـ backend مرة واحدة فقط
    try {
      await axios.post(`http://localhost:3000/visits`, visitData);
      console.log(`📊 زيارة مسجلة:`, visitData);
    } catch (err) {
      console.error("⚠️ فشل تسجيل الزيارة:", err.response?.data || err.message);
    }

    // ✅ عرض البطاقة
    res.render(template, { employee });

  } catch (error) {
    console.error("❌ خطأ في تحميل بيانات البطاقة:", error.message);
    res.status(500).send("❌ فشل تحميل البطاقة");
  }
});
// 📌 تشغيل السيرفر
app.listen(4000, () => {
  console.log('✅ Frontend running on http://localhost:4000');
});
