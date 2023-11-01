'use client';
import { Post } from '../lib/definitions';
import TimeLineTabs from './TimeLineTabs';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/authOptions';
import { Text } from '@chakra-ui/react';

interface HomePageProps {
  data: Post[];
  otherData: Post[];
}
export async function HomePage({ data, otherData }: HomePageProps) {
  const session = await getServerSession(authOptions);

  const { name, email, profilePicture } = (await prisma.user.findUnique({
    where: {
      id: session?.user.id,
    },
  }))!;

  return (
    <div>
      <Text>Home</Text>
      <TimeLineTabs
        data={data}
        otherData={otherData}
        name={name}
        email={email}
        profilePicture={profilePicture}
      />
    </div>
  );
}

export default HomePage;
