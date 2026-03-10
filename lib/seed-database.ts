/**
 * Seed script to populate the database with initial dummy data
 * Run this once to migrate existing dummy data to Supabase
 */

import { categoriesService, contentItemsService, categoryContentService } from './database';

export async function seedDatabase() {
  try {
    console.log('🌱 Starting database seed...');

    // Create categories
    const recentlyAdded = await categoriesService.create({
      title: 'Recently Added',
      sort_order: 0
    });
    console.log('✅ Created "Recently Added" category');

    const category1 = await categoriesService.create({
      title: 'Category 1',
      sort_order: 1
    });
    console.log('✅ Created "Category 1"');

    const category2 = await categoriesService.create({
      title: 'Category 2',
      sort_order: 2
    });
    console.log('✅ Created "Category 2"');

    // Create content items
    const content1 = await contentItemsService.create({
      title: 'New Content',
      description: 'New exciting content',
      thumbnail_url: '/images/content-1.png',
      content_type: 'video',
      rating: 'PG',
      monetization: false,
      visibility: 'public'
    });
    console.log('✅ Created content: New Content');

    const content2 = await contentItemsService.create({
      title: 'Saints Story',
      description: 'Stories of the saints',
      thumbnail_url: '/images/content-2.png',
      content_type: 'video',
      rating: 'G',
      monetization: false,
      visibility: 'public'
    });
    console.log('✅ Created content: Saints Story');

    const content3 = await contentItemsService.create({
      title: 'Dust to Dust',
      description: 'A journey through the desert',
      thumbnail_url: '/images/content-3.png',
      content_type: 'video',
      rating: 'PG-13',
      monetization: true,
      visibility: 'public'
    });
    console.log('✅ Created content: Dust to Dust');

    const content4 = await contentItemsService.create({
      title: 'Content 4',
      description: 'Fourth content item',
      thumbnail_url: '/images/content-1.png',
      content_type: 'video',
      rating: 'G',
      monetization: false,
      visibility: 'public'
    });
    console.log('✅ Created content: Content 4');

    const content5 = await contentItemsService.create({
      title: 'Content 5',
      description: 'Fifth content item',
      thumbnail_url: '/images/content-2.png',
      content_type: 'video',
      rating: 'PG',
      monetization: true,
      visibility: 'public'
    });
    console.log('✅ Created content: Content 5');

    const content6 = await contentItemsService.create({
      title: 'Content 6',
      description: 'Sixth content item',
      thumbnail_url: '/images/content-3.png',
      content_type: 'video',
      rating: 'PG-13',
      monetization: true,
      visibility: 'public'
    });
    console.log('✅ Created content: Content 6');

    const content7 = await contentItemsService.create({
      title: 'Content 7',
      description: 'Seventh content item',
      thumbnail_url: '/images/content-1.png',
      content_type: 'video',
      rating: 'G',
      monetization: false,
      visibility: 'public'
    });
    console.log('✅ Created content: Content 7');

    // Add content to categories
    await categoryContentService.addContentToCategory(recentlyAdded.id, content1.id, 0);
    await categoryContentService.addContentToCategory(recentlyAdded.id, content2.id, 1);
    await categoryContentService.addContentToCategory(recentlyAdded.id, content3.id, 2);
    console.log('✅ Added 3 items to "Recently Added"');

    await categoryContentService.addContentToCategory(category1.id, content4.id, 0);
    await categoryContentService.addContentToCategory(category1.id, content5.id, 1);
    console.log('✅ Added 2 items to "Category 1"');

    await categoryContentService.addContentToCategory(category2.id, content6.id, 0);
    await categoryContentService.addContentToCategory(category2.id, content7.id, 1);
    console.log('✅ Added 2 items to "Category 2"');

    console.log('🎉 Database seeding completed successfully!');
    return { success: true };
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}


