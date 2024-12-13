import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from "@/components/ui/checkbox";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIME_SLOTS = Array.from({ length: 12 * 4 }, (_, i) => {
  const hour = Math.floor(i / 4) + 8;
  const minute = (i % 4) * 15;
  const isPM = hour >= 12;
  const displayHour = hour > 12 ? hour - 12 : hour;
  return {
    hour,
    minute,
    label: minute === 0 ? `${displayHour}${isPM ? 'pm' : 'am'}` : `${displayHour}:${minute.toString().padStart(2, '0')}`
  };
});

type Course = {
  class_id: number;
  title: string;
  description: string;
  credits: string;
  enrolled: number;
  max_enroll: number;
  reserved: number;
  waitlisted: number;
  class_times: string[];
  url: string;
};

type CourseBlock = {
  course: Course;
  startIndex: number;
  endIndex: number;
  hasOverlap?: boolean;
  overlapIndex?: number;
};

export default function CourseSchedule({ courses }: { courses: Course[] }) {
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);

  const selectedCourses = courses.filter(course => 
    selectedCourseIds.includes(course.class_id)
  );

  const toggleCourse = (courseId: number) => {
    setSelectedCourseIds(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  const formatCourseTitle = (title: string) => {
    const match = title?.match(/([A-Za-z]+)\s*[-]?\s*(\d+[A-Za-z]*)\s*[-]?\s*(.*)/);
    if (match) {
      const [_, subject, number, name] = match;
      return `${subject} ${number} ${name}`;
    }
    return title;
  };

  const parseTimeToMinutes = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + (minutes || 0);
    } catch (e) {
      return 0;
    }
  };

  const mapDayToAbbrev = (day: string) => {
    const dayMap: { [key: string]: string } = {
      'Mo': 'Monday',
      'Tu': 'Tuesday',
      'We': 'Wednesday',
      'Th': 'Thursday',
      'F': 'Friday'
    };
    return dayMap[day] || day;
  };

  const getCourseBlocksForDay = (day: string): CourseBlock[] => {
    const blocks: CourseBlock[] = [];
    
    selectedCourses.forEach(course => {
      try {
        const courseTimes = course.class_times?.[0];
        if (!courseTimes) return;

        const [dayStr, timeRange] = courseTimes.split(' ');
        if (!dayStr || !timeRange) return;

        const days = dayStr.match(/.{1,2}/g) || [];
        if (!days.some(d => mapDayToAbbrev(d) === day)) return;

        const [startTime, endTime] = timeRange.split('-');
        const startMinutes = parseTimeToMinutes(startTime);
        const endMinutes = parseTimeToMinutes(endTime);

        if (startMinutes < 8 * 60 || endMinutes > 20 * 60) return;

        const startIndex = Math.floor((startMinutes - 8 * 60) / 15);
        const endIndex = Math.floor((endMinutes - 8 * 60) / 15);

        blocks.push({
          course,
          startIndex,
          endIndex
        });
      } catch (e) {
        console.error('Error parsing course time:', e);
      }
    });

    // Check for overlaps
    blocks.forEach((block, i) => {
      blocks.forEach((otherBlock, j) => {
        if (i !== j) {
          if (!(block.endIndex <= otherBlock.startIndex || block.startIndex >= otherBlock.endIndex)) {
            block.hasOverlap = true;
            block.overlapIndex = i;
            otherBlock.hasOverlap = true;
            otherBlock.overlapIndex = j;
          }
        }
      });
    });

    return blocks;
  };

  const getCourseStyle = (course: Course, hasOverlap: boolean, index: number) => {
    const styles = [
      'bg-blue-100 border-blue-600',
      'bg-green-100 border-green-600',
      'bg-purple-100 border-purple-600',
      'bg-amber-100 border-amber-600',
      'bg-rose-100 border-rose-600',
      'bg-teal-100 border-teal-600',
      'bg-indigo-100 border-indigo-600',
      'bg-orange-100 border-orange-600'
    ];

    const hash = course.class_id % styles.length;
    const baseStyle = styles[hash];
    
    if (hasOverlap) {
      return `${baseStyle} opacity-75 border-2`;
    }
    
    return `${baseStyle} border-l-2`;
  };

  return (
    <Card className="w-full min-w-full">
      <CardHeader className="p-0 border-b">
        <div className="grid grid-cols-6 divide-x border-b">
          <div className="col-span-1"></div>
          {DAYS.map((day) => (
            <div
              key={day}
              className="col-span-1 text-center text-xs font-semibold py-0.5 text-white bg-blue-900"
            >
              {day}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-[200px_1fr] divide-x">
          <div className="h-[768px] overflow-auto border-r">
            <div className="p-2 space-y-1">
              {courses.map((course) => (
                <div key={course.class_id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`course-${course.class_id}`}
                    checked={selectedCourseIds.includes(course.class_id)}
                    onCheckedChange={() => toggleCourse(course.class_id)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor={`course-${course.class_id}`}
                    className="text-[11px] leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {formatCourseTitle(course.title)}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-5 divide-x">
            {DAYS.map((day) => (
              <div key={day} className="col-span-1 relative">
                {TIME_SLOTS.map((timeSlot, index) => (
                  <div
                    key={`${day}-${index}`}
                    className="h-4 border-b"
                  />
                ))}
                {getCourseBlocksForDay(day).map((block, idx) => {
                  const height = (block.endIndex - block.startIndex) * 16;
                  const top = block.startIndex * 16;
                  const left = block.hasOverlap ? (idx % 2 ? 4 : 0) : 0;
                  const width = block.hasOverlap ? 'calc(100% - 4px)' : '100%';
                  
                  return (
                    <div
                      key={`${block.course.class_id}-${block.startIndex}`}
                      className={`absolute ${getCourseStyle(block.course, block.hasOverlap || false, idx)} overflow-hidden hover:shadow-lg transition-shadow`}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `${left}px`,
                        width
                      }}
                      title={`${block.course.title}\n${block.course.description}\nEnrolled: ${block.course.enrolled}/${block.course.max_enroll}`}
                    >
                      <div className="px-1">
                        <div className="font-medium text-[10px] leading-tight truncate">
                          {formatCourseTitle(block.course.title)}
                        </div>
                        <div className="text-[8px] leading-tight truncate opacity-75">
                          {block.course.enrolled}/{block.course.max_enroll}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

