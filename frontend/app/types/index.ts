export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: number;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  instructor: string;
  location: string;
  time: {
    day: string;
    start: string;
    end: string;
  };
  color: string;
}

export interface GradeData {
  courseId: string;
  distribution: {
    'A+': number;
    'A': number;
    'A-': number;
    'B+': number;
    'B': number;
    'B-': number;
    'C+': number;
    'C': number;
    'C-': number;
    'D': number;
    'F': number;
  };
  average: number;
}