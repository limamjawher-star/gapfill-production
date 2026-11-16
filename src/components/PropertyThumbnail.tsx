'use client';

import React from 'react';
import Image, { StaticImageData } from 'next/image';
import { Home } from 'lucide-react';
import parisLoftImg from '../assets/images/listing_paris_loft_1794857513291.jpg';
import sedonaCasitaImg from '../assets/images/listing_sedona_casita_1794857499523.jpg';
import lisbonTerraceImg from '../assets/images/listing_lisbon_terrace_1794857500187.jpg';

const DEMO_PROPERTY_PHOTOS: Record<string, StaticImageData> = {
  demo_prop_1: parisLoftImg,
  demo_prop_2: sedonaCasitaImg,
  demo_prop_3: lisbonTerraceImg,
};

interface PropertyThumbnailProps {
  propertyId: string;
  propertyName: string;
  propertyType?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PropertyThumbnail({
  propertyId,
  propertyName,
  propertyType,
  className = '',
  size = 'md',
}: PropertyThumbnailProps) {
  const matchedPhoto = DEMO_PROPERTY_PHOTOS[propertyId];

  const dimensions =
    size === 'sm'
      ? 'h-12 w-14 rounded-lg'
      : size === 'lg'
      ? 'h-44 w-full rounded-xl'
      : 'h-20 w-24 rounded-xl';

  if (matchedPhoto) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden border border-[#EBEBEB] bg-[#F7F7F7] ${dimensions} ${className}`}
      >
        <Image
          src={matchedPhoto}
          alt={propertyName}
          fill
          sizes="(max-width: 768px) 120px, 240px"
          referrerPolicy="no-referrer"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center border border-[#EBEBEB] bg-gradient-to-br from-[#F7F7F7] to-[#EBEBEB] text-[#717171] ${dimensions} ${className}`}
      aria-label={propertyName}
    >
      <Home className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5 text-[#222222]'} />
      {size === 'lg' && propertyType && (
        <span className="mt-1.5 text-xs font-medium text-[#717171]">
          {propertyType}
        </span>
      )}
    </div>
  );
}
