'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Task } from '@/lib/supabase/types';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { User as UserIcon, AlertTriangle, Plus, Minus } from 'lucide-react';
import { differenceInMinutes, differenceInDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isToday, isThisWeek, isThisMonth, eachDayOfInterval, isSameDay, format } from 'date-fns';
import { parseDateOnlyLocal } from '@/lib/utils/date-utils';
import { useFamilyMembers } from '@/hooks/use-family-members';

interface GanttTask {
  id: string;
  title: string;
  start: Date;
  end: Date;
  priority: string;
  assigned_to: string[];
  is_urgent: boolean;
}

interface GanttViewProps {
  tasks: Task[];
  isFullScreen: boolean;
  onEdit?: (task: Task) => void;
}

export default function GanttView({ tasks, isFullScreen, onEdit }: GanttViewProps) {
  const { getMemberName } = useFamilyMembers({ includePets: false, includeExtended: true });
  const [timeScale, setTimeScale] = useState<'day' | 'week' | 'month'>('week');
  const [columnScale, setColumnScale] = useState(1); // Magnification scale
  const [currentDate, setCurrentDate] = useState(new Date());
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, placement: 'below' });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentTimePosition, setCurrentTimePosition] = useState(0);
  
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  const SCALE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const ganttTasks: GanttTask[] = tasks.map(task => {
    // Use due_date as the primary reference for task positioning
    const dueDate = task.due_date ? parseDateOnlyLocal(task.due_date) : new Date();
    
    // Tasks appear as single-day items on their due date
    // For multi-day display, we could use created_at to due_date range
    const startDate = dueDate;
    const endDate = dueDate;
    
    // Urgent should reflect the explicit task flag only
    const isUrgent = Boolean((task as any).is_urgent);
    
    return {
      id: task.id,
      title: task.title,
      start: startDate,
      end: endDate,
      priority: task.priority,
      assigned_to: task.assigned_to || [],
      is_urgent: isUrgent
    };
  });

  // Sort tasks: urgent first, then by priority, then by start date
  ganttTasks.sort((a, b) => {
    if (a.is_urgent && !b.is_urgent) return -1;
    if (!a.is_urgent && b.is_urgent) return 1;
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.start.getTime() - b.start.getTime();
  });

  // Get date range based on time scale - aligned with Calendar implementation
  const getDateRange = useCallback(() => {
    switch (timeScale) {
      case 'day':
        return {
          start: startOfDay(currentDate),
          end: endOfDay(currentDate),
          days: [currentDate]
        };
      case 'week':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        return {
          start: weekStart,
          end: weekEnd,
          days: eachDayOfInterval({ start: weekStart, end: weekEnd })
        };
      case 'month':
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          start: monthStart,
          end: monthEnd,
          days: eachDayOfInterval({ start: monthStart, end: monthEnd })
        };
    }
  }, [currentDate, timeScale]);

  const dateRange = getDateRange();

  // Get column count based on time scale
  const getColumnCount = useCallback(() => {
    if (timeScale === 'day') return 24; // 24 hours
    if (timeScale === 'week') return 7; // 7 days
    return dateRange.days.length; // actual days in month
  }, [timeScale, dateRange.days.length]);

  // Calculate column width based on container width and zoom
  const dynamicColumnWidth = useCallback(() => {
    if (!containerWidth) return 60; // Fallback while measuring
    
    const columnCount = getColumnCount();
    if (!columnCount) return 60;
    
    // At 100% zoom, columns should fit exactly within container
    const baseColumnWidth = containerWidth / columnCount;
    
    // Apply zoom scale for zooming functionality
    return baseColumnWidth * columnScale;
  }, [containerWidth, getColumnCount, columnScale]);

  const effectiveColumnWidth = dynamicColumnWidth();

  // Update container width with ResizeObserver
  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.unobserve(container);
      resizeObserver.disconnect();
    };
  }, []);

  // Update current time indicator position
  useEffect(() => {
    const updateCurrentTime = () => {
      const now = new Date();
      
      if (timeScale === 'day') {
        const startOfToday = startOfDay(now);
        const minutesSinceStart = differenceInMinutes(now, startOfToday);
        const positionPercentage = (minutesSinceStart / (24 * 60)) * 100;
        setCurrentTimePosition(positionPercentage);
      } else if (timeScale === 'week') {
        const weekStart = startOfWeek(now, { weekStartsOn: 0 });
        const minutesSinceWeekStart = differenceInMinutes(now, weekStart);
        const positionPercentage = (minutesSinceWeekStart / (7 * 24 * 60)) * 100;
        setCurrentTimePosition(positionPercentage);
      } else if (timeScale === 'month') {
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        const totalMinutes = differenceInMinutes(monthEnd, monthStart);
        const minutesSinceMonthStart = differenceInMinutes(now, monthStart);
        const positionPercentage = (minutesSinceMonthStart / totalMinutes) * 100;
        setCurrentTimePosition(positionPercentage);
      }
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [timeScale, currentDate]);

  // Calculate task position and width - aligned with Calendar implementation
  const getTaskPosition = useCallback((task: GanttTask) => {
    const taskStart = new Date(task.start);
    const taskEnd = new Date(task.end);
    
    let leftPercentage = 0;
    let widthPercentage = 0;
    
    if (timeScale === 'day') {
      // Calculate position based on hours for the current day
      const dayStart = startOfDay(currentDate);
      const dayEnd = endOfDay(currentDate);
      
      // Only show tasks that are on this day
      if (!isSameDay(taskStart, currentDate)) {
        return { left: '0%', width: '0%', visible: false };
      }
      
      // For day view, position at noon by default since tasks are date-only
      leftPercentage = 50; // Middle of the day (noon)
      widthPercentage = 100 / 24; // 1 hour width
    } else if (timeScale === 'week') {
      // Calculate position based on days
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      
      // Find which day of the week the task falls on
      const dayIndex = dateRange.days.findIndex(day => isSameDay(day, startOfDay(taskStart)));
      
      if (dayIndex === -1) {
        return { left: '0%', width: '0%', visible: false };
      }
      
      leftPercentage = (dayIndex / 7) * 100;
      widthPercentage = (1 / 7) * 100; // Single day width
    } else {
      // Month view
      const monthStart = startOfMonth(currentDate);
      
      // Find which day of the month the task falls on
      const dayIndex = dateRange.days.findIndex(day => isSameDay(day, startOfDay(taskStart)));
      
      if (dayIndex === -1) {
        return { left: '0%', width: '0%', visible: false };
      }
      
      leftPercentage = (dayIndex / dateRange.days.length) * 100;
      widthPercentage = Math.max((1 / dateRange.days.length) * 100, 3); // Minimum 3% width for visibility
    }
    
    return { left: `${leftPercentage}%`, width: `${widthPercentage}%`, visible: true };
  }, [timeScale, currentDate, dateRange.days]);

  const getTaskColor = (task: GanttTask) => {
    // Match TaskCard colors: high=pinkish, medium=yellow/gold, low=blue
    switch (task.priority) {
      case 'high':
        return '#9A5D5D';
      case 'medium':
        return '#8C7348';
      case 'low':
      default:
        return '#5B7CA3';
    }
  };

  const getTaskStyle = (task: GanttTask) => {
    const position = getTaskPosition(task);
    if (!(position as any).visible) {
      return { display: 'none' };
    }
    return {
      position: 'absolute' as const,
      left: position.left,
      width: position.width,
      backgroundColor: getTaskColor(task),
      top: '8px',
      height: '32px'
    };
  };

  // Synchronized scrolling
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    const scrollTop = target.scrollTop;
    
    if (leftPanelRef.current && rightPanelRef.current) {
      if (target === leftPanelRef.current) {
        rightPanelRef.current.scrollTop = scrollTop;
      } else if (target === rightPanelRef.current) {
        leftPanelRef.current.scrollTop = scrollTop;
      }
    }
  }, []);

  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    
    if (leftPanel && rightPanel) {
      leftPanel.addEventListener('scroll', handleScroll);
      rightPanel.addEventListener('scroll', handleScroll);
      
      return () => {
        leftPanel.removeEventListener('scroll', handleScroll);
        rightPanel.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  const handleTaskDrag = (taskId: string, newStart: Date) => {
    // Update task dates in database
    console.log('Update task', taskId, 'to start at', newStart);
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
      });

      if (response.ok) {
        // Refresh tasks
        window.location.reload();
      }
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  // Smart positioning for tooltip
  const calculateTooltipPosition = useCallback((event: React.MouseEvent) => {
    if (!tooltipRef.current) return;

    // Try to get element position first
    const target = event.currentTarget as HTMLElement;
    if (target && target.getBoundingClientRect) {
      try {
        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        
        // Check space below and above
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        // Check space right and left
        const spaceRight = window.innerWidth - rect.right;
        const spaceLeft = rect.left;
        
        let top = rect.bottom + 8; // Default: below with 8px gap
        let left = rect.left;
        let placement = 'below';
        
        // Position vertically
        if (spaceBelow < tooltipRect.height + 20 && spaceAbove > tooltipRect.height + 20) {
          // Show above
          top = rect.top - tooltipRect.height - 8;
          placement = 'above';
        }
        
        // Position horizontally
        if (spaceRight < tooltipRect.width && spaceLeft > tooltipRect.width) {
          // Align to right edge
          left = rect.right - tooltipRect.width;
        } else if (left + tooltipRect.width > window.innerWidth - 10) {
          // Prevent overflow on right
          left = window.innerWidth - tooltipRect.width - 10;
        }
        
        // Ensure minimum left margin
        if (left < 10) left = 10;
        
        setTooltipPosition({ top, left, placement });
        return;
      } catch (e) {
        // Fall through to mouse position approach
      }
    }
    
    // Fallback: use mouse position
    const x = mousePosition.x;
    const y = mousePosition.y;
    const tooltipWidth = 256; // w-64 = 16rem = 256px
    const tooltipHeight = 100; // approximate height
    
    let left = x + 10;
    let top = y + 10;
    
    // Adjust if tooltip would go off screen
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = x - tooltipWidth - 10;
    }
    if (top + tooltipHeight > window.innerHeight - 10) {
      top = y - tooltipHeight - 10;
    }
    
    setTooltipPosition({ top, left, placement: 'mouse' });
  }, [mousePosition]);

  // Get the full task object for a gantt task
  const getFullTask = (ganttTask: GanttTask): Task | undefined => {
    return tasks.find(t => t.id === ganttTask.id);
  };

  // Format time headers - aligned with Calendar implementation
  const getTimeHeaders = () => {
    if (timeScale === 'day') {
      const hours = Array.from({ length: 24 }, (_, i) => {
        const hour = i === 0 ? 12 : i > 12 ? i - 12 : i;
        const period = i < 12 ? 'AM' : 'PM';
        return `${hour} ${period}`;
      });
      return hours;
    } else if (timeScale === 'week') {
      return dateRange.days.map(day => format(day, 'EEE d'));
    } else {
      return dateRange.days.map(day => format(day, 'd'));
    }
  };

  return (
    <div className={`${isFullScreen ? 'h-screen p-6' : ''} flex flex-col`}>
      {/* Controls */}
      <div className="bg-[#30302E] border border-gray-600/30 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Time scale selector */}
            <div className="flex items-center gap-1 bg-gray-800 rounded-md p-1">
              <button
                onClick={() => setTimeScale('day')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  timeScale === 'day' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setTimeScale('week')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  timeScale === 'week' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setTimeScale('month')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  timeScale === 'month' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Month
              </button>
            </div>
            
            {/* Magnification controls */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-md p-1">
              <button
                onClick={() => {
                  const currentIndex = SCALE_OPTIONS.indexOf(columnScale);
                  if (currentIndex > 0) {
                    setColumnScale(SCALE_OPTIONS[currentIndex - 1]);
                  }
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={columnScale === SCALE_OPTIONS[0]}
              >
                <Minus className="h-4 w-4 text-gray-400" />
              </button>
              
              <span className="text-sm text-gray-400 min-w-[3rem] text-center">
                {Math.round(columnScale * 100)}%
              </span>
              
              <button
                onClick={() => {
                  const currentIndex = SCALE_OPTIONS.indexOf(columnScale);
                  if (currentIndex < SCALE_OPTIONS.length - 1) {
                    setColumnScale(SCALE_OPTIONS[currentIndex + 1]);
                  }
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={columnScale === SCALE_OPTIONS[SCALE_OPTIONS.length - 1]}
              >
                <Plus className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            <span className="text-sm text-gray-400">
              View: {timeScale === 'day' ? 'Hourly' : timeScale === 'week' ? 'Daily' : 'Monthly'}
            </span>
          </div>
        </div>
      </div>

      {/* Gantt Chart */}
      {isFullScreen ? (
        <div className="flex-1 overflow-hidden">
          <div className="bg-[#575553] border border-gray-600/30 rounded-lg flex h-full overflow-hidden">
            {/* Left Panel - Task List */}
            <div className="w-[20%] min-w-[200px] border-r border-gray-600/30 flex flex-col">
              {/* Header */}
              <div className="h-12 border-b border-gray-600/30 bg-[#30302E] px-4 flex items-center font-medium">
                Tasks
              </div>
              
              {/* Task rows */}
              <div ref={leftPanelRef} className="flex-1 overflow-y-auto">
            {ganttTasks.map((task, index) => {
              const fullTask = getFullTask(task);
              return (
                <div
                  key={task.id}
                  className={`h-12 flex items-center px-4 hover:bg-gray-700/40 cursor-pointer transition-colors ${
                    index % 2 === 0 ? 'bg-[#575553]' : 'bg-[#4A4847]'
                  }`}
                  onClick={() => {
                    if (fullTask) setSelectedTask(fullTask);
                  }}
                >
                  <div
                    className="w-1 h-8 mr-3 rounded-full"
                    style={{ backgroundColor: getTaskColor(task) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1">
                      {task.is_urgent && <AlertTriangle className="h-3 w-3 text-red-500" />}
                      {task.title}
                    </div>
                    <div className="text-xs text-gray-400">
                      {task.start.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  {task.assigned_to && task.assigned_to.length > 0 && (
                    <div className="flex -space-x-2 ml-2">
                      {task.assigned_to.slice(0, 3).map((userId, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-full bg-gray-600 border border-gray-800 flex items-center justify-center text-xs"
                          title={userId}
                        >
                          <UserIcon className="w-3 h-3" />
                        </div>
                      ))}
                      {task.assigned_to.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-gray-700 border border-gray-800 flex items-center justify-center text-xs">
                          +{task.assigned_to.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

            {/* Right Panel - Timeline */}
            <div className="flex-1 flex flex-col min-w-0 border-l-2 border-gray-500/60 relative">
              {/* Left-edge inner shadow/gutter */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/20 to-transparent z-20" />
              {/* Time headers - scrollable with content */}
              <div className="h-12 border-b border-gray-600/30 bg-[#30302E] overflow-x-auto overflow-y-hidden" 
                   onScroll={(e) => {
                     // Sync header scroll with content
                     if (rightPanelRef.current) {
                       rightPanelRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                     }
                   }}>
                <div className="flex h-full" style={{ width: `${effectiveColumnWidth * getColumnCount()}px` }}>
                  {getTimeHeaders().map((header, index) => (
                    <div
                      key={index}
                      className="border-r border-gray-600/30 flex items-center justify-center text-xs text-gray-400"
                      style={{ width: `${effectiveColumnWidth}px` }}
                    >
                      {header}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Timeline grid */}
              <div 
                ref={(el) => {
                  rightPanelRef.current = el;
                  timelineContainerRef.current = el;
                }}
                className="flex-1 overflow-auto relative"
                onScroll={(e) => {
                  // Sync content scroll with header
                  const scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                  const headerEl = e.currentTarget.previousElementSibling as HTMLDivElement;
                  if (headerEl) {
                    headerEl.scrollLeft = scrollLeft;
                  }
                }}
          >
            <div 
              ref={timelineRef}
              className="relative"
              style={{ 
                width: `${effectiveColumnWidth * getColumnCount()}px`,
                height: `${Math.max(ganttTasks.length * 48, 48)}px` // Exact height based on tasks, minimum 1 row
              }}
            >
              {/* Grid lines - match Calendar styling */}
              {Array.from({ length: getColumnCount() }, (_, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 border-r ${
                    timeScale === 'day' ? 'border-gray-500/50' : 'border-gray-600/30'
                  } ${
                    timeScale === 'month' && i % 7 === 0 ? 'border-r-2' : ''
                  } pointer-events-none z-10`}
                  style={{ 
                    left: `${i * effectiveColumnWidth}px`, 
                    width: `${effectiveColumnWidth}px` 
                  }}
                />
              ))}
              
              {/* Row backgrounds */}
              {ganttTasks.map((_, index) => (
                <div
                  key={index}
                  className={`absolute left-0 right-0 h-12 z-0 ${
                    index % 2 === 0 ? 'bg-[#575553]' : 'bg-[#4A4847]'
                  }`}
                  style={{ top: `${index * 48}px` }}
                />
              ))}
              
              {/* Task bars */}
              {ganttTasks.map((task, index) => {
                const fullTask = getFullTask(task);
                return (
                  <div
                    key={task.id}
                    className="absolute left-0 right-0 h-12"
                    style={{ top: `${index * 48}px` }}
                  >
                        <div
                          className={`rounded-md cursor-pointer hover:brightness-110 hover:shadow-lg transition-all flex items-center px-3 text-white text-xs font-medium shadow-md`}
                          style={getTaskStyle(task)}
                          onClick={() => {
                            if (fullTask) setSelectedTask(fullTask);
                          }}
                      onMouseEnter={(e) => {
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        
                        setHoveredTaskId(task.id);
                        setMousePosition({ x: mouseX, y: mouseY });
                        
                        setTooltipPosition({
                          left: mouseX + 10,
                          top: mouseY + 10,
                          placement: 'mouse'
                        });
                      }}
                      onMouseMove={(e) => {
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        setMousePosition({ x: mouseX, y: mouseY });
                        
                        if (hoveredTaskId && tooltipRef.current) {
                          const tooltipWidth = 256;
                          const tooltipHeight = tooltipRef.current.offsetHeight || 150;
                          const gap = 10;
                          
                          let left = mouseX + gap;
                          let top = mouseY + gap;
                          
                          if (left + tooltipWidth > window.innerWidth - gap) {
                            left = mouseX - tooltipWidth - gap;
                          }
                          
                          if (top + tooltipHeight > window.innerHeight - gap) {
                            top = mouseY - tooltipHeight - gap;
                          }
                          
                          if (left < gap) left = gap;
                          if (top < gap) top = gap;
                          
                          setTooltipPosition({ left, top, placement: 'mouse' });
                        }
                      }}
                      onMouseLeave={() => setHoveredTaskId(null)}
                    >
                      <span className="truncate">{task.title}</span>
                    </div>
                  </div>
                );
              })}
              
              {/* Current time indicator */}
              {((timeScale === 'day' && isToday(currentDate)) ||
                (timeScale === 'week' && isThisWeek(currentDate, { weekStartsOn: 0 })) ||
                (timeScale === 'month' && isThisMonth(currentDate))) && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
                  style={{ left: `${currentTimePosition}%` }}
                >
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full" />
                </div>
              )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative w-full" style={{ height: 'calc(100vh - 16rem)', minHeight: '400px' }}>
          <div className="absolute inset-0 bg-[#575553] border border-gray-600/30 rounded-lg flex overflow-hidden">
            {/* Left Panel - Task List */}
            <div className="w-[20%] border-r border-gray-600/30 flex flex-col">
              {/* Header */}
              <div className="h-12 border-b border-gray-600/30 bg-[#30302E] px-4 flex items-center font-medium">
                Tasks
              </div>
              
              {/* Task rows */}
              <div ref={leftPanelRef} className="flex-1 overflow-y-auto">
                {ganttTasks.map((task, index) => {
                  const fullTask = getFullTask(task);
                  return (
                    <div
                      key={task.id}
                      className={`h-12 flex items-center px-4 hover:bg-gray-700/40 cursor-pointer transition-colors ${
                        index % 2 === 0 ? 'bg-[#575553]' : 'bg-[#4A4847]'
                      }`}
                      onClick={() => {
                        if (fullTask) setSelectedTask(fullTask);
                      }}
                    >
                      <div
                        className="w-1 h-8 mr-3 rounded-full"
                        style={{ backgroundColor: getTaskColor(task) }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-1">
                          {task.is_urgent && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          {task.title}
                        </div>
                        <div className="text-xs text-gray-400">
                          {task.start.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      {task.assigned_to && task.assigned_to.length > 0 && (
                        <div className="flex -space-x-2 ml-2">
                          {task.assigned_to.slice(0, 3).map((userId, i) => (
                            <div
                              key={i}
                              className="w-6 h-6 rounded-full bg-gray-600 border border-gray-800 flex items-center justify-center text-xs"
                              title={userId}
                            >
                              <UserIcon className="w-3 h-3" />
                            </div>
                          ))}
                          {task.assigned_to.length > 3 && (
                            <div className="w-6 h-6 rounded-full bg-gray-700 border border-gray-800 flex items-center justify-center text-xs">
                              +{task.assigned_to.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Timeline */}
            <div className="w-[80%] flex flex-col min-w-0 border-l-2 border-gray-500/60 relative">
              {/* Left-edge inner shadow/gutter */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/20 to-transparent z-20" />
              {/* Time headers - scrollable with content */}
              <div className="h-12 border-b border-gray-600/30 bg-[#30302E]" 
                   onScroll={(e) => {
                     // Sync header scroll with content
                     if (rightPanelRef.current) {
                       rightPanelRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                     }
                   }}>
                <div className="flex h-full" style={{ width: `${effectiveColumnWidth * getColumnCount()}px` }}>
                  {getTimeHeaders().map((header, index) => (
                    <div
                      key={index}
                      className="border-r border-gray-600/30 flex items-center justify-center text-xs text-gray-400"
                      style={{ width: `${effectiveColumnWidth}px` }}
                    >
                      {header}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Timeline grid */}
              <div 
                ref={(el) => {
                  rightPanelRef.current = el;
                  timelineContainerRef.current = el;
                }}
                className="flex-1 overflow-x-auto overflow-y-auto relative"
                onScroll={(e) => {
                  // Sync content scroll with header
                  const scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                  const headerEl = e.currentTarget.previousElementSibling as HTMLDivElement;
                  if (headerEl) {
                    headerEl.scrollLeft = scrollLeft;
                  }
                }}
              >
                <div 
                  ref={timelineRef}
                  className="relative"
                  style={{ 
                    width: `${effectiveColumnWidth * getColumnCount()}px`,
                    height: `${Math.max(ganttTasks.length * 48, 48)}px` // Exact height based on tasks, minimum 1 row
                  }}
                >
                  {/* Grid lines - match Calendar styling */}
                  {Array.from({ length: getColumnCount() }, (_, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 bottom-0 border-r ${
                        timeScale === 'day' ? 'border-gray-500/50' : 'border-gray-600/30'
                      } ${
                        timeScale === 'month' && i % 7 === 0 ? 'border-r-2' : ''
                      } pointer-events-none z-10`}
                      style={{ 
                        left: `${i * effectiveColumnWidth}px`, 
                        width: `${effectiveColumnWidth}px` 
                      }}
                    />
                  ))}
                  
                  {/* Row backgrounds */}
                  {ganttTasks.map((_, index) => (
                    <div
                      key={index}
                      className={`absolute left-0 right-0 h-12 z-0 ${
                        index % 2 === 0 ? 'bg-[#575553]' : 'bg-[#4A4847]'
                      }`}
                      style={{ top: `${index * 48}px` }}
                    />
                  ))}
                  
                  {/* Task bars */}
                  {ganttTasks.map((task, index) => {
                    const fullTask = getFullTask(task);
                    return (
                      <div
                        key={task.id}
                        className="absolute left-0 right-0 h-12"
                        style={{ top: `${index * 48}px` }}
                      >
                        <div
                          className={`rounded-md cursor-pointer hover:brightness-110 hover:shadow-lg transition-all flex items-center px-3 text-white text-xs font-medium shadow-md`}
                          style={getTaskStyle(task)}
                          onClick={() => {
                            if (fullTask) setSelectedTask(fullTask);
                          }}
                          onMouseEnter={(e) => {
                            const mouseX = e.clientX;
                            const mouseY = e.clientY;
                            
                            setHoveredTaskId(task.id);
                            setMousePosition({ x: mouseX, y: mouseY });
                            
                            setTooltipPosition({
                              left: mouseX + 10,
                              top: mouseY + 10,
                              placement: 'mouse'
                            });
                          }}
                          onMouseMove={(e) => {
                            const mouseX = e.clientX;
                            const mouseY = e.clientY;
                            setMousePosition({ x: mouseX, y: mouseY });
                            
                            if (hoveredTaskId && tooltipRef.current) {
                              const tooltipWidth = 256;
                              const tooltipHeight = tooltipRef.current.offsetHeight || 150;
                              const gap = 10;
                              
                              let left = mouseX + gap;
                              let top = mouseY + gap;
                              
                              if (left + tooltipWidth > window.innerWidth - gap) {
                                left = mouseX - tooltipWidth - gap;
                              }
                              
                              if (top + tooltipHeight > window.innerHeight - gap) {
                                top = mouseY - tooltipHeight - gap;
                              }
                              
                              if (left < gap) left = gap;
                              if (top < gap) top = gap;
                              
                              setTooltipPosition({ left, top, placement: 'mouse' });
                            }
                          }}
                          onMouseLeave={() => setHoveredTaskId(null)}
                        >
                          <span className="truncate">{task.title}</span>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Current time indicator */}
                  {((timeScale === 'day' && isToday(currentDate)) ||
                    (timeScale === 'week' && isThisWeek(currentDate, { weekStartsOn: 0 })) ||
                    (timeScale === 'month' && isThisMonth(currentDate))) && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
                      style={{ left: `${currentTimePosition}%` }}
                    >
                      <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#DC2626' }} />
          <span>Urgent</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#9A5D5D' }} />
          <span>High</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#8C7348' }} />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#5B7CA3' }} />
          <span>Low</span>
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => {
            setSelectedTask(null);
          }}
          onComplete={async () => {
            await handleCompleteTask(selectedTask.id);
            setSelectedTask(null);
          }}
          onEdit={onEdit ? () => {
            onEdit(selectedTask);
            setSelectedTask(null);
          } : undefined}
        />
      )}

      {/* Hover Tooltip */}
      {hoveredTaskId && (() => {
        const task = ganttTasks.find(t => t.id === hoveredTaskId);
        const fullTask = task ? getFullTask(task) : null;
        if (!fullTask) return null;
        
        return (
          <div 
            ref={tooltipRef}
            className="fixed z-50 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none"
            style={{
              position: 'fixed',
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              visibility: tooltipPosition.top === 0 && tooltipPosition.left === 0 ? 'hidden' : 'visible'
            }}
          >
            <div className="space-y-2">
              <div className="font-medium text-sm text-white flex items-center gap-1">
                {(fullTask as any).is_urgent && <AlertTriangle className="h-4 w-4 text-red-500" />}
                {fullTask.title}
              </div>
              
              {fullTask.description && (
                <div className="text-xs text-gray-300 line-clamp-2">
                  {fullTask.description}
                </div>
              )}
              
              <div className="text-xs">
                <div className={`inline-block px-2 py-1 rounded ${
                  fullTask.priority === 'high' ? 'bg-red-600/20 text-red-400' :
                  fullTask.priority === 'medium' ? 'bg-yellow-600/20 text-yellow-400' :
                  'bg-blue-600/20 text-blue-400'
                }`}>
                  {fullTask.priority} priority
                </div>
                {fullTask.due_date && (
                  <div className="text-gray-400 mt-1">
                    Due: {parseDateOnlyLocal(fullTask.due_date).toLocaleDateString()}
                  </div>
                )}
              </div>
              
              {(() => {
                const namesFromUsers = (fullTask as any).assigned_users?.map((u: any) => u?.name).filter(Boolean) || [];
                if (namesFromUsers.length > 0) {
                  return (
                    <div className="text-xs text-gray-400">
                      Assigned to: {namesFromUsers.join(', ')}
                    </div>
                  );
                }
                const ids = fullTask.assigned_to || [];
                if (ids.length > 0) {
                  const mappedNames = ids.map((id: string) => getMemberName(id)).filter(Boolean);
                  return (
                    <div className="text-xs text-gray-400">
                      Assigned to: {mappedNames.join(', ')}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
