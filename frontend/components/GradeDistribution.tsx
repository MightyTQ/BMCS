import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { gradeData } from '@/app/data/grades';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// Soft, pastel colors
const COLORS = [
  '#98FB98', // Pale green
  '#87CEEB', // Sky blue
  '#DDA0DD', // Plum
  '#F0E68C', // Khaki
  '#FFB6C1', // Light pink
  '#B0C4DE', // Light steel blue
  '#DEB887', // Burlywood
  '#98FB98', // Pale green
  '#87CEEB', // Sky blue
  '#DDA0DD', // Plum
  '#F0E68C', // Khaki
];

const defaultBarColor = '#98FB98'; // Soft green color

export default function GradeDistribution() {
  const courseList = Object.keys(gradeData);
  const [selectedCourse, setSelectedCourse] = useState(courseList[0]);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');

  const prepareData = () => {
    const data = gradeData[selectedCourse].distribution;
    return Object.entries(data).map(([grade, count]) => ({
      grade,
      count,
      percentage: (count / Object.values(data).reduce((a, b) => a + b, 0)) * 100,
    }));
  };

  const data = prepareData();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-gray-200 rounded shadow-sm">
          <p className="text-sm">{`${label}: ${payload[0].value.toFixed(1)}%`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Grade Distribution</CardTitle>
        <CardDescription>
          View grade distribution across different courses
        </CardDescription>
        <div className="flex space-x-4">
          <Select
            value={selectedCourse}
            onValueChange={setSelectedCourse}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a course" />
            </SelectTrigger>
            <SelectContent>
              {courseList.map((course) => (
                <SelectItem key={course} value={course}>
                  {course}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={chartType}
            onValueChange={(value: 'bar' | 'pie') => setChartType(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select chart type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar Chart</SelectItem>
              <SelectItem value="pie">Pie Chart</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart 
                data={data}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis 
                  dataKey="grade"
                  tick={{ fill: '#666' }}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: '#666' }}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                  domain={[0, 'auto']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="percentage"
                  fill={defaultBarColor}
                  radius={[4, 4, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            ) : (
              <PieChart>
                <Pie
                  data={data}
                  dataKey="percentage"
                  nameKey="grade"
                  cx="50%"
                  cy="50%"
                  outerRadius={150}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(1)}%`
                  }
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Course Average: {gradeData[selectedCourse].average.toFixed(3)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}