import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { EmployeeCard } from './employee-card.entity';
import { EmployeeImage } from './EmployeeImage.entity';
import { Visit } from './visit.entity';

@Entity()
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  conemail: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailTitle?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  jobTitle: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  conphone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  phoneTitle?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsapp: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  wechat?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telephone?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  locationTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  conStreet?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  conAdressLine?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  conCity?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  conState?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  conCountry?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  conZipcode?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  conDirection?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  conGoogleMapUrl?: string;

  //  Communication
  @Column({ type: 'varchar', length: 20, nullable: true })
  smsNumber?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  faxNumber?: string;

  //  Card & QR
  @Column({ type: 'text', nullable: true })
  cardUrl: string;

  @Column({ type: 'text', nullable: true })
  qrCode: string;

  @Column({ nullable: true })
  designId: string;

  @Column({ type: 'int', default: 1 })
  qrStyle: number;

  @Column({ type: 'boolean', default: false })
  cardStyleSection: boolean;

    @Column({ type: 'int', default: 1 })
  shadowX: number;

  @Column({ type: 'int', default: 1 })
  shadowY: number;

  @Column({ type: 'int', default: 3 })
  shadowBlur: number;

  @Column({ type: 'int', default: 1 })
  shadowSpread: number;

  @Column({ type: 'int', default: 16 })
  cardRadius: number;

  //  About Section
  @Column({ type: 'varchar', length: 255, nullable: true })
  aboutTitle?: string;

  @Column({ type: 'text', nullable: true })
  about?: string;

  //  Social Media
  @Column({ type: 'varchar', length: 255, nullable: true })
  socialTitle?: string;

  @Column({ type: 'text', nullable: true })
  socialDescription?: string;

  @Column({ type: 'text', nullable: true })
  profileImageUrl?: string;

  @Column({ type: 'text', nullable: true })
  secondaryImageUrl?: string;

  @Column({ type: 'text', nullable: true })
  logoUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facebook?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facebookTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facebookSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  facebookImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instagram?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instgramTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instgramSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  instagramImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tiktok?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tiktokTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tiktokSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  tiktokImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  snapchat?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  snapchatTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  snapchatSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  snapchatImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  x?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  xTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  xSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  xImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkedin?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkedinTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkedinSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  linkedinImageUrl?: string;

  @Column({ type: 'text', nullable: true })
  customImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customImageTitle?: string;

  @Column({ type: 'text', nullable: true })
  customImageDescription?: string;

  //  Testimonials
  @Column({ type: 'text', nullable: true })
  testimonialImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  testimonialTitle?: string;

  @Column({ type: 'text', nullable: true })
  testimonialDescription?: string;

  @Column({ type: 'text', nullable: true })
  testimonialText?: string;

  @Column({ type: 'text', nullable: true })
  testimonialName?: string;

  @Column({ type: 'text', nullable: true })
  testimonialDesignation?: string;

  //  Working Hours
  @Column({ type: 'varchar', length: 255, nullable: true })
  workingHoursTitle?: string;

  @Column({ type: 'boolean', default: false })
  showWorkingHours: boolean;

  @Column({ type: 'boolean', default: false })
  isOpen24Hours: boolean;

  @Column({ type: 'text', nullable: true })
  workingHoursImageUrl?: string;

  @Column({ type: 'json', nullable: true })
  workingHours?: {
    monday?: { from: string; to: string };
    tuesday?: { from: string; to: string };
    wednesday?: { from: string; to: string };
    thursday?: { from: string; to: string };
    friday?: { from: string; to: string };
    saturday?: { from: string; to: string };
    sunday?: { from: string; to: string };
  } | null;

  //  PDF Gallery
  @Column({ type: 'varchar', length: 255, nullable: true })
  pdfGalleryTitle?: string;

  @Column({ type: 'text', nullable: true })
  pdfGalleryDescription?: string;

  @Column({ type: 'text', nullable: true })
  pdfFileUrl?: string;

  @Column({ type: 'text', nullable: true })
  pdfThumbnailUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pdfTitle?: string;

  @Column({ type: 'text', nullable: true })
  pdfSubtitle?: string;

  //  Video Section
  @Column({ type: 'varchar', length: 255, nullable: true })
  videoTitle?: string;

  @Column({ type: 'text', nullable: true })
  videoDescription?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  videoType?: 'youtube' | 'vimeo';

  @Column({ type: 'text', nullable: true })
  videoUrl?: string;

  //  Button Block
  @Column({ type: 'varchar', length: 255, nullable: true })
  buttonBlockTitle?: string;

  @Column({ type: 'text', nullable: true })
  buttonBlockDescription?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  buttonLabel?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buttonLink?: string;

  //  Contact Form
  @Column({ type: 'varchar', length: 100, nullable: true })
  contactFormName?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactFormDisplayType?: 'overlay' | 'inline';

  @Column({ type: 'boolean', default: false })
  preventMultipleFormViews: boolean;

  @Column({ type: 'text', nullable: true })
  contactFormHeaderImageUrl?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contactFormTitle?: string;

  @Column({ type: 'text', nullable: true })
  contactFormDescription?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contactFieldLabel?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactFieldType?: 'one-line' | 'multi-line' | 'email' | 'phone';

  @Column({ type: 'boolean', default: false })
  contactFieldRequired: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactFieldErrorMessage?: string;

  //  Feedback / Ratings
  @Column({ type: 'varchar', length: 255, nullable: true })
  feedbackTitle?: string;

  @Column({ type: 'text', nullable: true })
  feedbackDescription?: string;

  @Column({ type: 'int', default: 5 })
  feedbackMaxRating: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  feedbackIconType?: 'star' | 'heart' | 'thumb' | 'smile';

  @Column({ type: 'boolean', default: false })
  showRatingLabels: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lowestRatingLabel?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  highestRatingLabel?: string;

  @Column({ type: 'boolean', default: false })
  collectFeedbackOnLowRating: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  highRatingHeading?: string;

  @Column({ type: 'text', nullable: true })
  highRatingDescription?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  highRatingCTA?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  highRatingRedirectUrl?: string;

  @Column({ type: 'int', default: 0 })
  autoRedirectAfterSeconds: number;

  @Column({ type: 'boolean', default: false })
  enableAutoRedirect: boolean;

  //  External Links
 
  @Column({ type: 'varchar', length: 255, nullable: true })
  linksTitle?: string;

  @Column({ type: 'text', nullable: true })
  linksDescription?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLink?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  workLinkImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkk?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  workLinkkImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkk?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  workLinkkkImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkk?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkkTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkkSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  workLinkkkkImageUrl?: string;
 @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkkk?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkkkTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLinkkkkkSubtitle?: string;

  @Column({ type: 'text', nullable: true })
  workLinkkkkkImageUrl?: string;

  //  Wallets
  @Column({ type: 'text', nullable: true })
  googleWalletUrl?: string;

  @Column({ type: 'text', nullable: true })
  appleWalletUrl?: string;

  // Relations
  @OneToMany(() => EmployeeImage, (image) => image.employee)
  images: EmployeeImage[];

  @ManyToOne(() => Company, (company) => company.employees, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  company: Company;

  @OneToMany(() => EmployeeCard, (card) => card.employee)
  cards: EmployeeCard[];

  @OneToMany(() => Visit, (visit) => visit.employee)
  visits: Visit[];
}
