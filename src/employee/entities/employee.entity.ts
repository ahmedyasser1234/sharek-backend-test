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

  @Column({ type: 'varchar', length: 100,nullable: true })
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

  @Column({ type: 'varchar', length: 20 , nullable: true })
  whatsapp: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  wechat?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telephone?: string;

  @Column({ type: 'text', nullable: true })
  cardUrl: string;

  @Column({ type: 'text', nullable: true })
  qrCode: string;

  @Column({ nullable: true })
  designId: string;

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

  @Column({ type: 'varchar', length: 20, nullable: true })
  smsNumber?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  faxNumber?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  aboutTitle?: string;

  @Column({ type: 'text', nullable: true })
  about?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  socialTitle?: string;

  @Column({ type: 'text', nullable: true })
  socialDescription?: string;

  @Column({ type: 'text', nullable: true })
  profileImageUrl?: string;

  @Column({ type: 'text', nullable: true })
  secondaryImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facebook?: string;

  @Column({ type: 'text', nullable: true })
  facebookImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instagram?: string;

  @Column({ type: 'text', nullable: true })
  instagramImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tiktok?: string;

  @Column({ type: 'text', nullable: true })
  tiktokImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  snapchat?: string;

  @Column({ type: 'text', nullable: true })
  snapchatImageUrl?: string;

  @Column({ type: 'text', nullable: true })
  customImageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customImageTitle?: string;

  @Column({ type: 'text', nullable: true })
  customImageDescription?: string;

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
  
  @Column({ type: 'varchar', length: 255, nullable: true })
  videoTitle?: string;

  @Column({ type: 'text', nullable: true })
  videoDescription?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buttonBlockTitle?: string;

  @Column({ type: 'text', nullable: true })
  buttonBlockDescription?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  buttonLabel?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buttonLink?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  videoType?: 'youtube' | 'vimeo';

  @Column({ type: 'text', nullable: true })
  videoUrl?: string;

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  workLink?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  productsLink?: string;

  @Column({ type: 'text', nullable: true })
  googleWalletUrl?: string;

  @Column({ type: 'text', nullable: true })
  appleWalletUrl?: string;

  @OneToMany(() => EmployeeImage, image => image.employee)
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
