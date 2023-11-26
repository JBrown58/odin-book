'use client';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Button,
  Avatar,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useDisclosure,
  useColorModeValue,
  Center,
  Icon,
  HStack,
  Heading,
} from '@chakra-ui/react';
import { GiHamburgerMenu } from 'react-icons/gi';
import { AiOutlineClose } from 'react-icons/ai';
import { RiFlashlightFill } from 'react-icons/ri';
import CreatePostModal from './CreatePostModal';
import SideBar from './SideBar';
import { getUnreadMessagesCount } from '../lib/actions';

export default function NavBar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    const fetchData = async () => {
      const count = await getUnreadMessagesCount();
      setUnreadMessageCount(Number(count));
    };
    fetchData();
  }, []);

  const handleSignOut = () => {
    signOut({ redirect: false }).then(() => {
      router.push('/');
    });
  };

  return (
    <Box px={4} bg={useColorModeValue('gray.800', 'black')} h={{ base: 65 }} className="test">
      <Flex h={16} alignItems="center" justifyContent={'space-between'}>
        <Icon as={RiFlashlightFill} h={8} w={8} onClick={() => router.push('/')} />
        <Center flex="1" display={{ base: 'none' }}>
          <Heading as="h3" size={{ base: 'xs', sm: 'lg' }}>
            Social Media App
          </Heading>
        </Center>
        <HStack>
          {session ? (
            <>
              <Box position="relative">
                <CreatePostModal />
                <IconButton aria-label="Unread messages" icon={<SideBar />} variant="ghost" />
                {unreadMessageCount > 0 && (
                  <Box
                    position="absolute"
                    top="-1"
                    right="-1"
                    bg="red.500"
                    borderRadius="full"
                    width="auto"
                    minWidth="1.5em"
                    height="1.5em"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    fontSize="0.8em"
                    color="white"
                  >
                    {unreadMessageCount}
                  </Box>
                )}
              </Box>
              <Menu>
                <MenuButton
                  as={Avatar}
                  size="sm"
                  src={session.user.image as string}
                  cursor={'pointer'}
                  role="profile-button"
                />
                <MenuList>
                  <MenuItem
                    id="profile-link"
                    onClick={() => router.push(`/profile?userid=${session.user.id}&page=1`)}
                  >
                    Profile
                  </MenuItem>
                  <MenuItem
                    onClick={() => router.push(`/friends?userid=${session.user.id}&page=1`)}
                  >
                    Friends
                  </MenuItem>
                  <MenuItem onClick={handleSignOut}>Sign Out</MenuItem>
                </MenuList>
              </Menu>
            </>
          ) : (
            <Button onClick={() => signIn()}>Sign In</Button>
          )}
        </HStack>
      </Flex>
    </Box>
  );
}
