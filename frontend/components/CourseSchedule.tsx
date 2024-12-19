import React, { useState, useEffect } from 'react';
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
  course_code: string;
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

type Message = {
  id: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: number;
};

export default function CourseSchedule({ courses }: { courses: Course[] }) {
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const normalizeCourseCode = (code: string): string => {
    const codeOnly = code.split(':')[0];
    return codeOnly
      .replace(/\s+/g, '')
      .toUpperCase()
      // Don't replace EECS with CS
      .replace(/COMPSCI(?=[0-9])/, 'CS');
  };

  const parseCourseCodes = (content: string): string[] => {
    // Match both emoji-prefixed and plain course codes for both COMPSCI and EECS
    const patterns = [
      /🎓\s*((?:COMPSCI|CS|EECS)\s*[A-Z]?\d+[A-Z]*(?:L[AB])?)/g,  // Emoji format
      /(?:COMPSCI|CS|EECS)\s*[A-Z]?\d+[A-Z]*(?:L[AB])?/g          // Plain text format
    ];

    const courseCodes = new Set<string>();
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanCode = match.replace('🎓 ', '').trim();
          const codeOnly = cleanCode.split(':')[0].trim();
          courseCodes.add(codeOnly);
        });
      }
    });

    return Array.from(courseCodes);
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const savedMessages = localStorage.getItem('chatMessages');
      if (savedMessages) {
        const parsedMessages: Message[] = JSON.parse(savedMessages);
        setMessages(parsedMessages);
      }
    };

    handleStorageChange();

    window.addEventListener('storage', handleStorageChange);
    
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const systemMessages = messages.filter(m => m.sender === 'system');
    if (systemMessages.length > 0) {
      const latestMessage = systemMessages[systemMessages.length - 1];
      const recommendedCourses = parseCourseCodes(latestMessage.content);
      
      const courseIds = courses.filter(course => 
        recommendedCourses.some(code => 
          normalizeCourseCode(course.course_code) === normalizeCourseCode(code)
        )
      ).map(course => course.class_id);

      setSelectedCourseIds(courseIds);
    }
  }, [messages, courses]);

  const toggleCourse = (courseId: number) => {
    setSelectedCourseIds(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  const sortCourses = (coursesToSort: Course[]) => {
    return [...coursesToSort].sort((a, b) => {
      const getCodeParts = (code: string) => {
        const match = code.match(/([A-Za-z]+)\s*([A-Z])?(\d+)([A-Z]*)/);
        if (!match) return { dept: code, prefix: '', num: 0, suffix: '' };
        const [_, dept, prefix = '', numStr, suffix = ''] = match;
        return {
          dept,
          prefix,
          num: parseInt(numStr),
          suffix
        };
      };

      const aCode = getCodeParts(a.course_code);
      const bCode = getCodeParts(b.course_code);

      if (aCode.dept !== bCode.dept) return aCode.dept.localeCompare(bCode.dept);
      if (aCode.prefix !== bCode.prefix) return aCode.prefix.localeCompare(bCode.prefix);
      if (aCode.num !== bCode.num) return aCode.num - bCode.num;
      return aCode.suffix.localeCompare(bCode.suffix);
    });
  };

  const isCourseFullyEnrolled = (course: Course) => {
    return course.enrolled >= course.max_enroll;
  };

  const getCourseStatusColor = (course: Course) => {
    if (isCourseFullyEnrolled(course) && course.waitlisted > 0) {
      return 'text-red-600';
    }
    if (!isCourseFullyEnrolled(course) && course.waitlisted > 0) {
      return 'text-amber-600';
    }
    return '';
  };

  const formatCourseTitle = (courseCode: string) => {
    const match = courseCode.match(/([A-Za-z]+)\s*([A-Z])?(\d+[A-Z]*)(.*)/);
    if (match) {
      const [_, dept, prefix = '', number, rest] = match;
      return `${dept} ${prefix}${number}${rest}`.trim();
    }
    return courseCode;
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
    
    const selectedCourses = sortCourses(
      courses.filter(course => selectedCourseIds.includes(course.class_id))
    );

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

  const getCourseStyle = (course: Course, hasOverlap: boolean) => {
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
    
    return hasOverlap 
      ? `${baseStyle} opacity-75 border-2`
      : `${baseStyle} border-l-2`;
  };

  const sortedCourses = sortCourses(courses);

  return (
    <Card className="w-full">
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
              {sortedCourses.map((course) => (
                <div key={course.class_id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`course-${course.class_id}`}
                    checked={selectedCourseIds.includes(course.class_id)}
                    onCheckedChange={() => toggleCourse(course.class_id)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor={`course-${course.class_id}`}
                    className={`text-[11px] leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70 
                      ${getCourseStatusColor(course)}`}
                  >
                    {formatCourseTitle(course.course_code)}
                    {course.waitlisted > 0 && (
                      <span className="ml-1">({course.waitlisted} WL)</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-5 divide-x">
            {DAYS.map((day) => (
              <div key={day} className="col-span-1 relative">
                {TIME_SLOTS.map((_, index) => (
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
                  const course = block.course;
                  
                  return (
                    <div
                      key={`${course.class_id}-${block.startIndex}`}
                      className={`absolute ${getCourseStyle(course, block.hasOverlap || false)} overflow-hidden hover:shadow-lg transition-shadow`}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `${left}px`,
                        width
                      }}
                      title={`${course.course_code}\n${course.title}\n${course.description}\nEnrolled: ${course.enrolled}/${course.max_enroll}\nWaitlist: ${course.waitlisted}`}
                    >
                      <div className="px-1">
                        <div className="font-medium text-[10px] leading-tight truncate">
                          {formatCourseTitle(course.course_code)}
                        </div>
                        <div className="text-[8px] leading-tight truncate opacity-75">
                          {course.enrolled}/{course.max_enroll}
                          {course.waitlisted > 0 && (
                            <span className="ml-1">
                              (WL: {course.waitlisted})
                            </span>
                          )}
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