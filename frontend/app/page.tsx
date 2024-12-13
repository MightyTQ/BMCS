'use client';

import ChatInterface from '@/components/ChatInterface';
import GradeDistribution from '@/components/GradeDistribution';
import CourseSchedule from '@/components/CourseSchedule';
import courseData from '@/app/data/courses.json';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-[1920px] mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-gray-900">
          Educational Planning Dashboard
        </h1>
        
        <div className="grid grid-cols-1 gap-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ChatInterface />
            <GradeDistribution />
          </div>
          
          <div className="w-full">
            <CourseSchedule courses={courseData} />
          </div>
        </div>
      </div>
    </main>
  );
}