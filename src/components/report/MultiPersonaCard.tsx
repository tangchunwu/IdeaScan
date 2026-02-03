import { useState } from "react";
import { User, Target, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/shared";
import { motion, AnimatePresence } from "framer-motion";

interface Persona {
       type: "primary" | "secondary" | "tertiary";
       name: string;
       role: string;
       age?: string;
       gender?: string;
       location?: string;
       income?: string;
       description: string;
       painPoints: string[];
       behaviors: string[];
       goals: string[];
       channels: string[];
}

interface MultiPersonaCardProps {
       personas: Persona[];
       className?: string;
}

const personaTypeConfig = {
       primary: {
              label: "核心用户",
              color: "bg-primary text-primary-foreground",
              icon: Star,
              description: "最有可能购买的目标群体",
       },
       secondary: {
              label: "潜在用户",
              color: "bg-secondary text-secondary-foreground",
              icon: Target,
              description: "可转化的次要目标群体",
       },
       tertiary: {
              label: "边缘用户",
              color: "bg-muted text-muted-foreground",
              icon: User,
              description: "需要更多教育的群体",
       },
};

export const MultiPersonaCard = ({
       personas,
       className = "",
}: MultiPersonaCardProps) => {
       const [currentIndex, setCurrentIndex] = useState(0);

       const handlePrev = () => {
              setCurrentIndex((prev) => (prev === 0 ? personas.length - 1 : prev - 1));
       };

       const handleNext = () => {
              setCurrentIndex((prev) => (prev === personas.length - 1 ? 0 : prev + 1));
       };

       if (personas.length === 0) return null;

       const currentPersona = personas[currentIndex];
       const config = personaTypeConfig[currentPersona.type];
       const IconComponent = config.icon;

       return (
              <GlassCard className={`p-6 overflow-hidden ${className}`}>
                     {/* Header with Navigation */}
                     <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                   <div className={`p-2 rounded-xl ${config.color}`}>
                                          <IconComponent className="w-5 h-5" />
                                   </div>
                                   <div>
                                          <div className="flex items-center gap-2">
                                                 <h3 className="font-semibold text-lg">用户画像</h3>
                                                 <Badge variant="outline" className="text-xs">
                                                        {currentIndex + 1} / {personas.length}
                                                 </Badge>
                                          </div>
                                          <p className="text-sm text-muted-foreground">{config.description}</p>
                                   </div>
                            </div>

                            {personas.length > 1 && (
                                   <div className="flex items-center gap-2">
                                          <Button variant="outline" size="icon" onClick={handlePrev} className="h-8 w-8">
                                                 <ChevronLeft className="w-4 h-4" />
                                          </Button>
                                          <Button variant="outline" size="icon" onClick={handleNext} className="h-8 w-8">
                                                 <ChevronRight className="w-4 h-4" />
                                          </Button>
                                   </div>
                            )}
                     </div>

                     {/* Persona Type Tabs */}
                     <div className="flex gap-2 mb-6">
                            {personas.map((persona, index) => {
                                   const pConfig = personaTypeConfig[persona.type];
                                   return (
                                          <Button
                                                 key={index}
                                                 variant={currentIndex === index ? "default" : "outline"}
                                                 size="sm"
                                                 onClick={() => setCurrentIndex(index)}
                                                 className={`h-8 text-xs ${currentIndex === index ? pConfig.color : ""}`}
                                          >
                                                 {pConfig.label}
                                          </Button>
                                   );
                            })}
                     </div>

                     {/* Persona Content */}
                     <AnimatePresence mode="wait">
                            <motion.div
                                   key={currentIndex}
                                   initial={{ opacity: 0, x: 20 }}
                                   animate={{ opacity: 1, x: 0 }}
                                   exit={{ opacity: 0, x: -20 }}
                                   transition={{ duration: 0.2 }}
                            >
                                   {/* Basic Info */}
                                   <div className="flex items-start gap-4 mb-6 p-4 rounded-xl bg-muted/30">
                                          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-2xl">
                                                 👤
                                          </div>
                                          <div className="flex-1">
                                                 <h4 className="font-bold text-xl mb-1">{currentPersona.name}</h4>
                                                 <p className="text-muted-foreground mb-2">{currentPersona.role}</p>
                                                 <div className="flex flex-wrap gap-2 text-xs">
                                                        {currentPersona.age && (
                                                               <Badge variant="secondary">{currentPersona.age}</Badge>
                                                        )}
                                                        {currentPersona.gender && (
                                                               <Badge variant="secondary">{currentPersona.gender}</Badge>
                                                        )}
                                                        {currentPersona.location && (
                                                               <Badge variant="secondary">📍 {currentPersona.location}</Badge>
                                                        )}
                                                        {currentPersona.income && (
                                                               <Badge variant="secondary">💰 {currentPersona.income}</Badge>
                                                        )}
                                                 </div>
                                          </div>
                                   </div>

                                   {/* Description */}
                                   <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                                          {currentPersona.description}
                                   </p>

                                   {/* Details Grid */}
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          {/* Pain Points */}
                                          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                                                 <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                                                        <span className="text-red-500">😣</span>
                                                        核心痛点
                                                 </h5>
                                                 <ul className="space-y-2">
                                                        {currentPersona.painPoints.slice(0, 3).map((point, i) => (
                                                               <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                                      <span className="text-red-400 mt-0.5">•</span>
                                                                      {point}
                                                               </li>
                                                        ))}
                                                 </ul>
                                          </div>

                                          {/* Goals */}
                                          <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                                                 <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                                                        <span className="text-green-500">🎯</span>
                                                        期望目标
                                                 </h5>
                                                 <ul className="space-y-2">
                                                        {currentPersona.goals.slice(0, 3).map((goal, i) => (
                                                               <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                                      <span className="text-green-400 mt-0.5">•</span>
                                                                      {goal}
                                                               </li>
                                                        ))}
                                                 </ul>
                                          </div>

                                          {/* Behaviors */}
                                          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                                                 <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                                                        <span className="text-blue-500">📱</span>
                                                        行为特征
                                                 </h5>
                                                 <ul className="space-y-2">
                                                        {currentPersona.behaviors.slice(0, 3).map((behavior, i) => (
                                                               <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                                      <span className="text-blue-400 mt-0.5">•</span>
                                                                      {behavior}
                                                               </li>
                                                        ))}
                                                 </ul>
                                          </div>

                                          {/* Channels */}
                                          <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                                                 <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                                                        <span className="text-purple-500">📢</span>
                                                        触达渠道
                                                 </h5>
                                                 <div className="flex flex-wrap gap-2">
                                                        {currentPersona.channels.map((channel, i) => (
                                                               <Badge key={i} variant="outline" className="text-xs">
                                                                      {channel}
                                                               </Badge>
                                                        ))}
                                                 </div>
                                          </div>
                                   </div>
                            </motion.div>
                     </AnimatePresence>
              </GlassCard>
       );
};

export default MultiPersonaCard;
