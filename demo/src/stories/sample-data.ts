export interface Person {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  status: "active" | "inactive" | "pending";
  visits: number;
}

export const BASE_DATA: Person[] = [
  { id: 1,  firstName: "Tanner",    lastName: "Linsley",  age: 24, status: "active",   visits: 100 },
  { id: 2,  firstName: "Tandy",     lastName: "Miller",   age: 40, status: "inactive", visits: 40  },
  { id: 3,  firstName: "Joe",       lastName: "Dirte",    age: 45, status: "pending",  visits: 20  },
  { id: 4,  firstName: "Sara",      lastName: "Johnson",  age: 31, status: "active",   visits: 572 },
  { id: 5,  firstName: "Michael",   lastName: "Brown",    age: 28, status: "active",   visits: 211 },
  { id: 6,  firstName: "Emily",     lastName: "Davis",    age: 35, status: "inactive", visits: 88  },
  { id: 7,  firstName: "Chris",     lastName: "Wilson",   age: 22, status: "pending",  visits: 15  },
  { id: 8,  firstName: "Jessica",   lastName: "Moore",    age: 29, status: "active",   visits: 304 },
  { id: 9,  firstName: "Daniel",    lastName: "Taylor",   age: 52, status: "inactive", visits: 63  },
  { id: 10, firstName: "Ashley",    lastName: "Anderson", age: 44, status: "active",   visits: 191 },
  { id: 11, firstName: "Matthew",   lastName: "Thomas",   age: 37, status: "pending",  visits: 7   },
  { id: 12, firstName: "Amanda",    lastName: "Jackson",  age: 26, status: "active",   visits: 437 },
  { id: 13, firstName: "Joshua",    lastName: "White",    age: 33, status: "inactive", visits: 119 },
  { id: 14, firstName: "Stephanie", lastName: "Harris",   age: 41, status: "active",   visits: 982 },
  { id: 15, firstName: "Andrew",    lastName: "Martin",   age: 19, status: "pending",  visits: 3   },
  { id: 16, firstName: "Lauren",    lastName: "Garcia",   age: 58, status: "active",   visits: 774 },
  { id: 17, firstName: "Ryan",      lastName: "Martinez", age: 47, status: "inactive", visits: 29  },
  { id: 18, firstName: "Megan",     lastName: "Robinson", age: 23, status: "active",   visits: 156 },
  { id: 19, firstName: "Kevin",     lastName: "Clark",    age: 36, status: "pending",  visits: 44  },
  { id: 20, firstName: "Hannah",    lastName: "Lewis",    age: 30, status: "active",   visits: 623 },
];

/** 1,000-row dataset for the virtualised story. */
export const LARGE_DATA: Person[] = Array.from({ length: 1000 }, (_, i) => ({
  ...BASE_DATA[i % BASE_DATA.length]!,
  id: i + 1,
  visits: BASE_DATA[i % BASE_DATA.length]!.visits + i * 3,
}));