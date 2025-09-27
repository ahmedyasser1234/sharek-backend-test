import {
  IsString,
  IsEmail,
  IsOptional,
  Matches,
  Length,
  IsBoolean,
  IsNumber,
  IsIn,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Ahmed Ali', maxLength: 1000 })
  @Length(0, 1000)
  @IsString()
  name: string;

  @ApiProperty({ example: 'ahmed@example.com', minLength: 5, maxLength: 100 })
  @IsEmail()
  @Length(5, 100)
  email: string;

  @ApiProperty({ example: 'contact@example.com', minLength: 5, maxLength: 100 })
  @IsEmail()
  @IsOptional()
  @Length(5, 100)
  conemail: string;

  @ApiPropertyOptional({ example: 'عنوان البريد الإلكتروني' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  emailTitle?: string;

  @ApiProperty({ example: 'Software Engineer', maxLength: 1000 })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  jobTitle: string;

  @ApiProperty({ example: '0123456789' })
  @Matches(/^\d{6,15}$/, { message: 'Phone must be between 6 and 15 digits' })
  phone: string;

  @ApiProperty({ example: '0987654321' })
  @IsOptional()
  @Matches(/^\d{6,15}$/, { message: 'Phone must be between 6 and 15 digits' })
  conphone: string;

  @ApiPropertyOptional({ example: 'رقم الهاتف للتواصل' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  phoneTitle?: string;

  @ApiProperty({ example: '01111222333' })
  @IsOptional()
  @Matches(/^\d{6,15}$/, { message: 'Phone must be between 6 and 15 digits' })
  whatsapp: string;

  @ApiPropertyOptional({ example: 'ahmedwechat' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  wechat?: string;

  @ApiPropertyOptional({ example: '022334455' })
  @IsOptional()
  @Matches(/^\d{6,15}$/, { message: 'Phone must be between 6 and 15 digits' })
  telephone?: string;

  @ApiPropertyOptional({  })
  @IsOptional()
  @IsString()
  cardUrl?: string;

  @ApiPropertyOptional({  })
  @IsOptional()
  @IsString()
  qrCode?: string;

  @ApiPropertyOptional({ example: 'design_01' })
  @IsOptional()
  @IsString()
  designId?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=location' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'موقع المكتب الرئيسي' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  locationTitle?: string;

  @ApiPropertyOptional({ example: 'شارع الثورة' })
  @Length(0, 255)
  @IsOptional()
  @IsString()
  conStreet?: string;

  @ApiPropertyOptional({ example: 'الحي الخامس، الدور الثاني' })
  @Length(0, 255)
  @IsOptional()
  @IsString()
  conAdressLine?: string;

  @ApiPropertyOptional({ example: 'القاهرة' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  conCity?: string;

  @ApiPropertyOptional({ example: 'القاهرة الكبرى' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  conState?: string;

  @ApiPropertyOptional({ example: 'مصر' })
  @Length(0, 100)
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
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
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
  @Length(0, 100)
  @IsOptional()
  @IsString()
  aboutTitle?: string;

  @ApiPropertyOptional({ example: 'أحمد مهندس برمجيات بخبرة 10 سنوات في تطوير الأنظمة' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  about?: string;

  @ApiPropertyOptional({ example: 'تابعني على السوشيال ميديا' })
  @Length(0, 100)
  @IsOptional()
  @IsString()
  socialTitle?: string;

  @ApiPropertyOptional({ example: 'أشارك محتوى تقني ومقالات عن البرمجة' })
  @Length(0, 1000)
  @IsOptional()
  @IsString()
  socialDescription?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  secondaryImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/ahmed' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  facebook?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  facebookImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://instagram.com/ahmed' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  instagram?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  instagramImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://tiktok.com/ahmed' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  tiktok?: string;

  @ApiPropertyOptional({ })
  @IsOptional()
  @IsString()
  tiktokImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://snapchat.com/add/ahmed' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  snapchat?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  snapchatImageUrl?: string;

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

  @ApiPropertyOptional({ example: true, description: 'هل يتم عرض مواعيد العمل للموظف؟' })
  @IsOptional()
  @IsBoolean()
  showWorkingHours?: boolean;


  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isOpen24Hours?: boolean;

  @ApiPropertyOptional({ })
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
  @IsObject()
  workingHours?: {
    monday?: { from: string; to: string };
    tuesday?: { from: string; to: string };
    wednesday?: { from: string; to: string };
    thursday?: { from: string; to: string };
    friday?: { from: string; to: string };
    saturday?: { from: string; to: string };
    sunday?: { from: string; to: string };
  };

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
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  buttonLink?: string;

  @ApiPropertyOptional({ example: 'youtube', enum: ['youtube', 'vimeo'] })
  @IsOptional()
  @IsIn(['youtube', 'vimeo'])
  videoType?: string;

  @ApiPropertyOptional({ example: 'https://youtube.com/embed/xyz' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
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
  @IsOptional()
  @IsNumber()
  feedbackMaxRating?: number;

  @ApiPropertyOptional({ example: 'star', enum: ['star', 'heart', 'thumb', 'smile'] })
  @IsOptional()
  @IsIn(['star', 'heart', 'thumb', 'smile'])
  feedbackIconType?: string;

  @ApiPropertyOptional({ example: true })
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
  @IsOptional()
  @IsNumber()
  autoRedirectAfterSeconds?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableAutoRedirect?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/work' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  workLink?: string;

  @ApiPropertyOptional({ example: 'https://example.com/products' })
  @Matches(/^https?:\/\/.+/, { message: 'Must be a valid URL' })
  @IsOptional()
  @IsString()
  productsLink?: string;
}
