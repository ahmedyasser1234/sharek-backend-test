import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsIn,
  IsObject,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';

type WorkingHoursType = {
  monday?: { from: string; to: string };
  tuesday?: { from: string; to: string };
  wednesday?: { from: string; to: string };
  thursday?: { from: string; to: string };
  friday?: { from: string; to: string };
  saturday?: { from: string; to: string };
  sunday?: { from: string; to: string };
};

type EmployeeImageType = {
  imageUrl: string;
  label?: string;
  publicId?: string;
};

// دالة مساعدة للتحقق من أن العنصر هو EmployeeImageType صالح
function isValidEmployeeImage(item: unknown): item is EmployeeImageType {
  return (
    typeof item === 'object' &&
    item !== null &&
    'imageUrl' in item &&
    typeof (item as EmployeeImageType).imageUrl === 'string'
  );
}

// دالة مساعدة للتحقق مما إذا كانت جميع العناصر فارغة
function areAllItemsEmpty(items: unknown[]): boolean {
  return items.every(item => 
    item === null || 
    item === undefined || 
    (typeof item === 'object' && Object.keys(item).length === 0) ||
    (typeof item === 'object' && !(item as EmployeeImageType).imageUrl)
  );
}
export class UpdateEmployeeDto {
  @ApiProperty({ example: 'Ahmed Ali', maxLength: 1000 })
  @Length(1, 1000)
  @IsString()
  @IsOptional()
  name: string;

  @ApiProperty({ example: 'ahmed@example.com', minLength: 5, maxLength: 100 })
  @IsOptional()
  email: string;

  @ApiProperty({ example: '+966512345678', description: 'رقم الهاتف بصيغة دولية' })
  @IsString()
  @IsOptional()
  phone: string;

  @ApiPropertyOptional({ example: 'contact@example.com' })
  @IsOptional()
  conemail?: string;

  @ApiPropertyOptional({ example: 'عنوان البريد الإلكتروني' })
  @IsOptional()
  @IsString()
  emailTitle?: string;

  @ApiPropertyOptional({ example: 'Software Engineer' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ example: '0987654321' })
  @IsOptional()
  conphone?: string;

  @ApiPropertyOptional({ example: 'رقم الهاتف للتواصل' })
  @IsOptional()
  @IsString()
  phoneTitle?: string;

  @ApiPropertyOptional({ example: '01111222333' })
  @IsOptional()
  whatsapp?: string;

  @ApiPropertyOptional({ example: 'ahmedwechat' })
  @IsOptional()
  @IsString()
  wechat?: string;

  @ApiPropertyOptional({ example: '022334455' })
  @IsOptional()
  telephone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cardUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qrCode?: string;

  @ApiPropertyOptional({ example: 'design_01' })
  @IsOptional()
  @IsString()
  designId?: string;

  @ApiPropertyOptional({ enum: [1, 2, 3], example: 2 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  qrStyle?: number;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  backgroundImage?: string;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  fontColorHead?: string;

  @ApiPropertyOptional({ example: '#333333' })
  @IsOptional()
  @IsString()
  fontColorHead2?: string;

  @ApiPropertyOptional({ example: '#666666' })
  @IsOptional()
  @IsString()
  fontColorParagraph?: string;

  @ApiPropertyOptional({ example: '#999999' })
  @IsOptional()
  @IsString()
  fontColorExtra?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  sectionBackground?: string;

  @ApiPropertyOptional({ example: '#f5f5f5' })
  @IsOptional()
  @IsString()
  Background?: string;

  @ApiPropertyOptional({ example: '#eeeeee' })
  @IsOptional()
  @IsString()
  sectionBackground2?: string;

  @ApiPropertyOptional({ example: 'rgba(0,0,0,0.2)' })
  @IsOptional()
  @IsString()
  dropShadow?: string;

  @ApiPropertyOptional({ example: 2 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  shadowX?: number;

  @ApiPropertyOptional({ example: 2 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  shadowY?: number;

  @ApiPropertyOptional({ example: 5 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  shadowBlur?: number;

  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  shadowSpread?: number;

  @ApiPropertyOptional({ example: 10 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  cardRadius?: number;

  @ApiPropertyOptional({ example: true, description: 'هل يتم عرض قسم تصميم البطاقة؟' })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  cardStyleSection?: boolean;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=location' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'موقع المكتب الرئيسي' })
  @IsOptional()
  @IsString()
  locationTitle?: string;

  @ApiPropertyOptional({ example: 'شارع الثورة' })
  @IsOptional()
  @IsString()
  conStreet?: string;

  @ApiPropertyOptional({ example: 'الحي الخامس، الدور الثاني' })
  @IsOptional()
  @IsString()
  conAdressLine?: string;

  @ApiPropertyOptional({ example: 'القاهرة' })
  @IsOptional()
  @IsString()
  conCity?: string;

  @ApiPropertyOptional({ example: 'القاهرة الكبرى' })
  @IsOptional()
  @IsString()
  conState?: string;

  @ApiPropertyOptional({ example: 'مصر' })
  @IsOptional()
  @IsString()
  conCountry?: string;

  @ApiPropertyOptional({ example: '11865' })
  @IsOptional()
  @IsString()
  conZipcode?: string;

  @ApiPropertyOptional({ example: 'خلف مول العرب، بجوار البنك الأهلي' })
  @IsOptional()
  @IsString()
  conDirection?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=direction' })
  @IsOptional()
  @IsString()
  conGoogleMapUrl?: string;

  @ApiPropertyOptional({ example: '0100000000' })
  @IsOptional()
  @IsString()
  smsNumber?: string;

  @ApiPropertyOptional({ example: '022000000' })
  @IsOptional()
  @IsString()
  faxNumber?: string;

  @ApiPropertyOptional({ example: 'نبذة عن الموظف' })
  @IsOptional()
  @IsString()
  aboutTitle?: string;

  @ApiPropertyOptional({ example: 'أحمد مهندس برمجيات بخبرة 10 سنوات' })
  @IsOptional()
  @IsString()
  about?: string;

  @ApiPropertyOptional({ example: 'تابعني على السوشيال ميديا' })
  @IsOptional()
  @IsString()
  socialTitle?: string;

  @ApiPropertyOptional({ example: 'أشارك محتوى تقني' })
  @IsOptional()
  @IsString()
  socialDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondaryImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/ahmed' })
  @IsOptional()
  @IsString()
  facebook?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  facebookTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  facebookSubtitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  facebookImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://instagram.com/ahmed' })
  @IsOptional()
  @IsString()
  instagram?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  instagramTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  instagramSubtitle?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  instagramImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://tiktok.com/ahmed' })
  @IsOptional()
  @IsString()
  tiktok?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  tiktokTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  tiktokSubtitle?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  tiktokImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://snapchat.com/add/ahmed' })
  @IsOptional()
  @IsString()
  snapchat?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  snapchatTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  snapchatSubtitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  snapchatImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://x.com/add/ahmed' })
  @IsOptional()
  @IsString()
  x?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  xTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  xSubtitle?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  xImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/add/ahmed' })
  @IsOptional()
  @IsString()
  linkedin?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  linkedinTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  linkedinSubtitle?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  linkedinImageUrl?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  customImageUrl?: string;

  @ApiPropertyOptional({ example: 'صورة مخصصة' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  customImageTitle?: string;

  @ApiPropertyOptional({ example: 'وصف للصورة المخصصة التي تظهر في البطاقة' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  customImageDescription?: string;

  @ApiPropertyOptional({  })
  @IsOptional()
  @IsString()
  testimonialImageUrl?: string;

  @ApiPropertyOptional({ example: 'رأي العميل' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  testimonialTitle?: string;

  @ApiPropertyOptional({ example: 'أحمد قدم لنا خدمة ممتازة في وقت قياسي' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  testimonialDescription?: string;

  @ApiPropertyOptional({ example: 'خدمة رائعة وسريعة' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  testimonialText?: string;

  @ApiPropertyOptional({ example: 'محمد عبد الله' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  testimonialName?: string;

  @ApiPropertyOptional({ example: 'مدير تقنية المعلومات' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  testimonialDesignation?: string;

  @ApiPropertyOptional({ example: 'ساعات العمل الرسمية' })
  @IsOptional()
  @IsString()
  workingHoursTitle?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'هل يتم عرض مواعيد العمل للموظف؟',
  })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  showWorkingHours?: boolean;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  isOpen24Hours?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/image.png' })
  @IsOptional()
  @IsString()
  workingHoursImageUrl?: string;

  @ApiPropertyOptional({
    example: {
      monday: { from: '09:00', to: '17:00' },
      friday: { from: '10:00', to: '16:00' },
    },
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as WorkingHoursType;
      } catch {
        return undefined;
      }
    }
    return value as WorkingHoursType;
  })
  @IsObject()
  workingHours?: WorkingHoursType;

  @ApiPropertyOptional({ example: 'كتالوج المنتجات' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  pdfGalleryTitle?: string;

  @ApiPropertyOptional({ example: 'تفاصيل حول ملفات PDF المعروضة' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  pdfGalleryDescription?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  pdfFileUrl?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  pdfThumbnailUrl?: string;

  @ApiPropertyOptional({ example: 'عنوان الملف' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  pdfTitle?: string;

  @ApiPropertyOptional({ example: 'وصف مختصر للملف' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  pdfSubtitle?: string;

  @ApiPropertyOptional({ example: 'فيديو تعريفي' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  videoTitle?: string;

  @ApiPropertyOptional({ example: 'شرح بالفيديو عن خدماتنا' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  videoDescription?: string;

  @ApiPropertyOptional({ example: 'عنوان القسم التفاعلي' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  buttonBlockTitle?: string;

  @ApiPropertyOptional({ example: 'وصف للقسم الذي يحتوي على زر CTA' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  buttonBlockDescription?: string;

  @ApiPropertyOptional({ example: 'اطلب الآن' })
  @Length(0, 50)
  @IsOptional()
  @IsString()
  buttonLabel?: string;

  @ApiPropertyOptional({ example: 'https://example.com/action' })
  @IsOptional()
  @IsString()
  buttonLink?: string;

  @ApiPropertyOptional({ example: 'youtube', enum: ['youtube', 'vimeo'] })
  @IsOptional()
  videoType?: string;

  @ApiPropertyOptional({ example: 'https://youtube.com/embed/xyz' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({ example: 'نموذج التواصل' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  contactFormName?: string;

  @ApiPropertyOptional({ example: 'overlay', enum: ['overlay', 'inline'] })
  @IsOptional()
  @IsIn(['overlay', 'inline'])
  contactFormDisplayType?: string;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  preventMultipleFormViews?: boolean;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  contactFormHeaderImageUrl?: string;

  @ApiPropertyOptional({ example: 'نموذج التواصل' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  contactFormTitle?: string;

  @ApiPropertyOptional({ example: 'يرجى تعبئة النموذج للتواصل معنا' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  contactFormDescription?: string;

  @ApiPropertyOptional({ example: 'رقم الهاتف' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  contactFieldLabel?: string;

  @ApiPropertyOptional({ example: 'phone', enum: ['one-line', 'multi-line', 'email', 'phone'] })
  @IsOptional()
  @IsIn(['one-line', 'multi-line', 'email', 'phone'])
  contactFieldType?: string;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  contactFieldRequired?: boolean;

  @ApiPropertyOptional({ example: 'هذا الحقل مطلوب' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  contactFieldErrorMessage?: string;

  @ApiPropertyOptional({ example: 'تقييم الخدمة' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  feedbackTitle?: string;

  @ApiPropertyOptional({ example: 'يرجى تقييم تجربتك معنا' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  feedbackDescription?: string;

  @ApiPropertyOptional({ example: 5 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  feedbackMaxRating?: number;

  @ApiPropertyOptional({ example: 'star', enum: ['star', 'heart', 'thumb', 'smile'] })
  @IsOptional()
  @IsIn(['star', 'heart', 'thumb', 'smile'])
  feedbackIconType?: string;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  showRatingLabels?: boolean;

  @ApiPropertyOptional({ example: 'سيئ جدًا' })
  @IsOptional()
  @IsString()
  lowestRatingLabel?: string;

  @ApiPropertyOptional({ example: 'ممتاز جدًا' })
  @IsOptional()
  @IsString()
  highestRatingLabel?: string;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  collectFeedbackOnLowRating?: boolean;

  @ApiPropertyOptional({ example: 'شكرًا لتقييمك المرتفع!' })
  @IsOptional()
  @IsString()
  highRatingHeading?: string;

  @ApiPropertyOptional({ example: 'نحن سعداء أنك استمتعت بالخدمة' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  highRatingDescription?: string;

  @ApiPropertyOptional({ example: 'شارك تجربتك الآن' })
  @IsOptional()
  @IsString()
  highRatingCTA?: string;

  @ApiPropertyOptional({ example: 'https://example.com/thank-you' })
  @IsOptional()
  @IsString()
  highRatingRedirectUrl?: string;

  @ApiPropertyOptional({ example: 5 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  autoRedirectAfterSeconds?: number;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value as boolean;
  })
  @IsOptional()
  @IsBoolean()
  enableAutoRedirect?: boolean;
  
  @ApiPropertyOptional({ example: 'تابعني على  موقعى ' })
  @IsOptional()
  @IsString()
  linksTitle?: string;

  @ApiPropertyOptional({ example: 'أشارك محتوى تقني' })
  @IsOptional()
  @IsString()
  linksDescription?: string;

  @ApiPropertyOptional({ example: 'https://example.com/work' })
  @IsOptional()
  @IsString()
  workLink?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkSubtitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/work' })
  @IsOptional()
  @IsString()
  workLinkk?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkSubtitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/work' })
  @IsOptional()
  @IsString()
  workLinkkk?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkSubtitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/work' })
  @IsOptional()
  @IsString()
  workLinkkkk?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkkTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkkSubtitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkkImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/work' })
  @IsOptional()
  @IsString()
  workLinkkkkk?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkkkTitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkkkSubtitle?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  workLinkkkkkImageUrl?: string;
 
 @ApiPropertyOptional({ 
    description: 'قائمة الصور للموظف - إرسال [] لحذف جميع الصور',
    type: [Object],
    example: [
      {
        imageUrl: 'https://example.com/image1.jpg',
        label: 'صورة الملف الشخصي',
        publicId: 'employee-123-image1'
      }
    ]
  })
  @IsOptional()
  @Transform(({ value }) => {
    console.log('🔄 Transform - القيمة المستلمة:', value);
    console.log('🔄 Transform - نوع القيمة:', typeof value);
    
    if (value === null || value === undefined) {
      console.log('🔄 Transform - قيمة فارغة، إرجاع undefined');
      return undefined;
    }

    // إذا كانت مصفوفة فارغة - هذا مقبول (لحذف الصور)
    if (Array.isArray(value) && value.length === 0) {
      console.log('🔄 Transform - مصفوفة فارغة [] - مقبولة لحذف الصور');
      return [];
    }

    // حالة خاصة: إذا كانت مصفوفة تحتوي على كائنات فارغة [{}] - تعاملها كمصفوفة فارغة
    if (Array.isArray(value) && value.length > 0) {
      console.log('🔄 Transform - فحص محتوى المصفوفة...');
      
      // تحقق إذا كانت جميع العناصر فارغة أو غير صالحة
      if (areAllItemsEmpty(value)) {
        console.log('🔄 Transform - جميع العناصر فارغة، معاملتها كمصفوفة فارغة []');
        return [];
      }
      
      // إذا كانت تحتوي على عناصر صالحة، ترجع العناصر الصالحة فقط
      const validArray: EmployeeImageType[] = value.filter(isValidEmployeeImage);
      
      console.log('🔄 Transform - الصور الصالحة:', validArray.length);
      
      if (validArray.length === 0) {
        console.log('🔄 Transform - لا توجد عناصر صالحة، إرجاع undefined');
        return undefined;
      }
      
      return validArray;
    }

    // إذا كانت string وتحاول تحويلها
    if (typeof value === 'string') {
      try {
        console.log('🔄 Transform - جاري تحويل string إلى JSON');
        const parsed: unknown = JSON.parse(value);
        console.log('🔄 Transform - نتيجة التحويل:', parsed);
        
        // نفس المنطق السابق ينطبق هنا
        if (Array.isArray(parsed) && parsed.length === 0) {
          console.log('🔄 Transform - تحويل إلى مصفوفة فارغة');
          return [];
        }
        
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (areAllItemsEmpty(parsed)) {
            console.log('🔄 Transform - جميع العناصر فارغة بعد التحويل، معاملتها كمصفوفة فارغة');
            return [];
          }
          
          const validArray: EmployeeImageType[] = parsed.filter(isValidEmployeeImage);
          
          console.log('🔄 Transform - الصور الصالحة بعد التحويل:', validArray.length);
          
          if (validArray.length === 0) {
            return undefined;
          }
          
          return validArray;
        }
      } catch (error) {
        console.log('🔄 Transform - فشل تحويل JSON:', error);
      }
    }

    console.log('🔄 Transform - القيمة غير صالحة، إرجاع undefined');
    return undefined;
  })
  images?: EmployeeImageType[];

}