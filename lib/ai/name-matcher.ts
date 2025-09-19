/**
 * Enhanced name matching for handling middle names, case variations, and partial matches
 */

import Fuse from 'fuse.js';

/**
 * Parse a full name into components
 */
function parseNameComponents(fullName: string): {
  first: string;
  middle: string[];
  last: string;
  normalized: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(p => p.length > 0);
  
  if (parts.length === 0) {
    return { first: '', middle: [], last: '', normalized: '' };
  }
  
  if (parts.length === 1) {
    return { 
      first: parts[0], 
      middle: [], 
      last: '', 
      normalized: parts[0].toLowerCase() 
    };
  }
  
  if (parts.length === 2) {
    return { 
      first: parts[0], 
      middle: [], 
      last: parts[1],
      normalized: `${parts[0]} ${parts[1]}`.toLowerCase()
    };
  }
  
  // 3 or more parts: first, middle(s), last
  return {
    first: parts[0],
    middle: parts.slice(1, -1),
    last: parts[parts.length - 1],
    normalized: fullName.toLowerCase().trim()
  };
}

/**
 * Check if two names match, considering middle names and variations
 */
function namesMatch(name1: string, name2: string): boolean {
  const n1 = parseNameComponents(name1);
  const n2 = parseNameComponents(name2);
  
  // Exact match (normalized)
  if (n1.normalized === n2.normalized) {
    return true;
  }
  
  // Both have first and last names
  if (n1.first && n1.last && n2.first && n2.last) {
    const firstMatch = n1.first.toLowerCase() === n2.first.toLowerCase();
    const lastMatch = n1.last.toLowerCase() === n2.last.toLowerCase();
    
    // First and last name match (ignore middle names)
    if (firstMatch && lastMatch) {
      return true;
    }
    
    // Check for nickname variations
    if (lastMatch && areNicknames(n1.first, n2.first)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if two names might be nicknames of each other
 */
function areNicknames(name1: string, name2: string): boolean {
  const nicknames: Record<string, string[]> = {
    'robert': ['rob', 'bob', 'bobby'],
    'william': ['will', 'bill', 'billy'],
    'richard': ['rick', 'dick', 'rich'],
    'michael': ['mike', 'mikey'],
    'christopher': ['chris'],
    'jonathan': ['jon', 'john'],
    'joseph': ['joe', 'joey'],
    'james': ['jim', 'jimmy', 'jamie'],
    'thomas': ['tom', 'tommy'],
    'benjamin': ['ben', 'benny'],
    'elizabeth': ['liz', 'beth', 'betty', 'eliza'],
    'margaret': ['maggie', 'meg', 'peggy'],
    'katherine': ['kate', 'katie', 'kathy', 'kat'],
    'jennifer': ['jen', 'jenny'],
    'patricia': ['pat', 'patty', 'trish'],
    'susan': ['sue', 'susie'],
    'deborah': ['deb', 'debbie'],
    'jessica': ['jess', 'jessie'],
    'claire': ['clare'],
    'auggie': ['august', 'augustus', 'gus'],
  };
  
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
  
  // Check both directions
  for (const [full, nicks] of Object.entries(nicknames)) {
    if ((n1 === full && nicks.includes(n2)) || 
        (n2 === full && nicks.includes(n1)) ||
        (nicks.includes(n1) && nicks.includes(n2))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Enhanced traveler matching that handles middle names and variations
 */
export async function enhancedTravelerMatching(
  travelers: string[],
  familyMembers: any[]
): Promise<{ matched: Array<{ name: string; id: string }>; unmatched: string[] }> {
  const matched: Array<{ name: string; id: string }> = [];
  const unmatched: string[] = [];
  
  console.log('[enhancedTravelerMatching] Input:', {
    travelers,
    familyMembers: familyMembers?.map(m => ({ id: m.id, name: m.name }))
  });
  
  if (!travelers || travelers.length === 0) {
    return { matched, unmatched };
  }
  
  for (const traveler of travelers) {
    let foundMatch = false;
    console.log(`[enhancedTravelerMatching] Processing traveler: "${traveler}"`);
    
    // Pass 1: Try direct matching with middle name handling
    for (const member of familyMembers) {
      if (namesMatch(traveler, member.name || '')) {
        console.log(`[enhancedTravelerMatching] Pass 1 match: "${traveler}" → "${member.name}" (${member.id})`);
        matched.push({ name: member.name, id: member.id }); // Use canonical member name
        foundMatch = true;
        break;
      }
    }
    
    if (foundMatch) continue;
    
    // Pass 2: Parse and try matching first + last only
    const travelerParts = parseNameComponents(traveler);
    if (travelerParts.first && travelerParts.last) {
      const simplifiedName = `${travelerParts.first} ${travelerParts.last}`;
      
      for (const member of familyMembers) {
        const memberParts = parseNameComponents(member.name || '');
        const memberSimplified = `${memberParts.first} ${memberParts.last}`;
        
        if (simplifiedName.toLowerCase() === memberSimplified.toLowerCase()) {
          console.log(`[enhancedTravelerMatching] Pass 2 match: "${traveler}" → "${member.name}" (${member.id})`);
          matched.push({ name: member.name, id: member.id }); // Use canonical member name
          foundMatch = true;
          break;
        }
      }
    }
    
    if (foundMatch) continue;
    
    // Pass 3: Fuzzy matching with adjusted threshold for longer names
    const fuse = new Fuse(familyMembers, {
      keys: ['name'],
      threshold: 0.35, // More lenient for longer names with middle names
      shouldSort: true,
    });
    
    const fuzzyResults = fuse.search(traveler);
    
    // If the name has middle names, be more lenient with fuzzy matching
    const hasMiddleNames = traveler.trim().split(/\s+/).length > 2;
    const threshold = hasMiddleNames ? 0.4 : 0.25;
    
    if (fuzzyResults.length > 0 && fuzzyResults[0].score !== undefined && fuzzyResults[0].score <= threshold) {
      // Additional check: ensure first and last names are present in both
      const memberParts = parseNameComponents(fuzzyResults[0].item.name || '');
      const travelerParts = parseNameComponents(traveler);
      
      if (travelerParts.first && travelerParts.last && memberParts.first && memberParts.last) {
        const firstSimilar = fuzzyResults[0].item.name.toLowerCase().includes(travelerParts.first.toLowerCase()) ||
                           travelerParts.first.toLowerCase().includes(memberParts.first.toLowerCase());
        const lastSimilar = fuzzyResults[0].item.name.toLowerCase().includes(travelerParts.last.toLowerCase()) ||
                          travelerParts.last.toLowerCase().includes(memberParts.last.toLowerCase());
        
        if (firstSimilar && lastSimilar) {
          console.log(`[enhancedTravelerMatching] Pass 3 fuzzy match: "${traveler}" → "${fuzzyResults[0].item.name}" (${fuzzyResults[0].item.id})`);
          matched.push({ name: fuzzyResults[0].item.name, id: fuzzyResults[0].item.id }); // Use canonical member name
          foundMatch = true;
        }
      }
    }
    
    if (!foundMatch) {
      console.log(`[enhancedTravelerMatching] No match found for: "${traveler}" - adding to unmatched`);
      unmatched.push(traveler);
    }
  }
  
  console.log('[enhancedTravelerMatching] Final results:', {
    matched: matched.map(m => `${m.name} (${m.id})`),
    unmatched
  });
  
  return { matched, unmatched };
}